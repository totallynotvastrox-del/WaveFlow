package app.waveflow.unofficial

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import org.json.JSONObject

/**
 * Keeps playback alive with the screen off and puts it on the lock
 * screen, the notification shade, headsets and Bluetooth remotes.
 *
 * The audio itself is decoded and played by the Rust engine in this same
 * process. This service owns only what Android asks of a media app: a
 * foreground notification, a media session, audio focus and a wake lock.
 * It reads the engine's state once a second through [PlaybackBridge] and
 * sends button presses back the same way.
 */
class PlaybackService : Service() {
    companion object {
        private const val CHANNEL_ID = "playback"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_TOGGLE = "app.waveflow.unofficial.action.TOGGLE"
        private const val ACTION_NEXT = "app.waveflow.unofficial.action.NEXT"
        private const val ACTION_PREVIOUS = "app.waveflow.unofficial.action.PREVIOUS"
        private const val PAUSED_GRACE_MS = 10 * 60 * 1000L

        fun start(context: Context) {
            try {
                context.startService(Intent(context, PlaybackService::class.java))
            } catch (_: Exception) {
                // Started from the background: the next onStart retries.
            }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var session: MediaSession
    private lateinit var audioManager: AudioManager
    private lateinit var notifications: NotificationManager
    private var focusRequest: AudioFocusRequest? = null
    private var hasFocus = false
    private var resumeOnFocusGain = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var foreground = false
    private var noisyRegistered = false

    private var lastState = "idle"
    private var lastRevision = -1L
    private var pausedSince = 0L
    private var title = ""
    private var artist: String? = null
    private var album: String? = null
    private var cover: Bitmap? = null

    private val poll = object : Runnable {
        override fun run() {
            tick()
            handler.postDelayed(this, 1000)
        }
    }

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // Headphones unplugged, Bluetooth gone: never blast the speaker.
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                PlaybackBridge.act(PlaybackBridge.PAUSE)
            }
        }
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                hasFocus = false
                resumeOnFocusGain = false
                PlaybackBridge.act(PlaybackBridge.PAUSE)
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                if (lastState == "playing" || lastState == "loading") {
                    resumeOnFocusGain = true
                    PlaybackBridge.act(PlaybackBridge.PAUSE)
                }
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                hasFocus = true
                if (resumeOnFocusGain) {
                    resumeOnFocusGain = false
                    PlaybackBridge.act(PlaybackBridge.PLAY)
                }
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        notifications = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notifications.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
                description = "What is playing, with playback controls"
                setShowBadge(false)
            }
        )

        session = MediaSession(this, "WaveFlow")
        session.setCallback(object : MediaSession.Callback() {
            override fun onPlay() = PlaybackBridge.act(PlaybackBridge.PLAY)
            override fun onPause() = PlaybackBridge.act(PlaybackBridge.PAUSE)
            override fun onSkipToNext() = PlaybackBridge.act(PlaybackBridge.NEXT)
            override fun onSkipToPrevious() = PlaybackBridge.act(PlaybackBridge.PREVIOUS)
            override fun onSeekTo(pos: Long) = PlaybackBridge.act(PlaybackBridge.SEEK, pos)
            override fun onStop() = PlaybackBridge.act(PlaybackBridge.PAUSE)
        })
        session.setSessionActivity(openAppIntent())

        handler.post(poll)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE -> PlaybackBridge.act(PlaybackBridge.TOGGLE)
            ACTION_NEXT -> PlaybackBridge.act(PlaybackBridge.NEXT)
            ACTION_PREVIOUS -> PlaybackBridge.act(PlaybackBridge.PREVIOUS)
        }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiped away from recents: the user is done with the app.
        PlaybackBridge.act(PlaybackBridge.PAUSE)
        leaveForeground()
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        handler.removeCallbacks(poll)
        leaveForeground()
        abandonFocus()
        session.isActive = false
        session.release()
        super.onDestroy()
    }

    private fun tick() {
        val raw = PlaybackBridge.state() ?: return
        val json = try {
            JSONObject(raw)
        } catch (_: Exception) {
            return
        }
        val state = json.optString("state", "idle")
        val revision = json.optLong("revision", 0)
        val position = json.optLong("positionMs", 0)
        val duration = json.optLong("durationMs", 0)
        val active = state == "playing" || state == "loading"

        val metadataChanged = revision != lastRevision
        if (metadataChanged) {
            lastRevision = revision
            title = json.optString("title", "")
            artist = text(json, "artist")
            album = text(json, "album")
            cover = loadCover(text(json, "coverPath"))
            val metadata = MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, duration)
            cover?.let { metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, it) }
            session.setMetadata(metadata.build())
        }

        val sessionState = when (state) {
            "playing" -> PlaybackState.STATE_PLAYING
            "loading" -> PlaybackState.STATE_BUFFERING
            "paused" -> PlaybackState.STATE_PAUSED
            else -> PlaybackState.STATE_STOPPED
        }
        session.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_SKIP_TO_NEXT or
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_SEEK_TO or
                        PlaybackState.ACTION_STOP
                )
                .setState(sessionState, position, if (state == "playing") 1f else 0f)
                .build()
        )

        if (active) {
            pausedSince = 0L
            requestFocus()
            holdWakeLock(true)
            enterForeground(state)
        } else {
            holdWakeLock(false)
            if (pausedSince == 0L) pausedSince = System.currentTimeMillis()
            val idleTooLong = System.currentTimeMillis() - pausedSince > PAUSED_GRACE_MS
            if (foreground && (state == "idle" || idleTooLong)) {
                leaveForeground()
                abandonFocus()
            }
        }

        if (foreground && (metadataChanged || state != lastState)) {
            notifications.notify(NOTIFICATION_ID, buildNotification(state))
        }
        lastState = state
    }

    private fun text(json: JSONObject, key: String): String? =
        if (json.isNull(key)) null else json.optString(key, "").ifEmpty { null }

    private fun loadCover(path: String?): Bitmap? {
        if (path.isNullOrEmpty()) return null
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, bounds)
            var sample = 1
            while (bounds.outWidth / sample > 640 || bounds.outHeight / sample > 640) sample *= 2
            BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
        } catch (_: Throwable) {
            null
        }
    }

    private fun enterForeground(state: String) {
        if (foreground) return
        try {
            val notification = buildNotification(state)
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            foreground = true
            session.isActive = true
            if (!noisyRegistered) {
                registerReceiver(
                    noisyReceiver,
                    IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
                )
                noisyRegistered = true
            }
        } catch (_: Exception) {
            // Not allowed from the background on this Android version;
            // tried again on the next tick once the app is visible.
        }
    }

    private fun leaveForeground() {
        if (noisyRegistered) {
            try {
                unregisterReceiver(noisyReceiver)
            } catch (_: Exception) {
            }
            noisyRegistered = false
        }
        holdWakeLock(false)
        if (!foreground) return
        foreground = false
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun holdWakeLock(hold: Boolean) {
        if (hold) {
            if (wakeLock == null) {
                val power = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WaveFlow:playback")
                    .apply { setReferenceCounted(false) }
            }
            if (wakeLock?.isHeld != true) wakeLock?.acquire(6 * 60 * 60 * 1000L)
        } else if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
    }

    private fun requestFocus() {
        if (hasFocus) return
        val request = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            .setOnAudioFocusChangeListener(focusListener, handler)
            .build()
            .also { focusRequest = it }
        hasFocus = audioManager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandonFocus() {
        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        hasFocus = false
        resumeOnFocusGain = false
    }

    private fun openAppIntent(): PendingIntent =
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    @Suppress("DEPRECATION")
    private fun action(icon: Int, label: String, action: String): Notification.Action {
        val intent = PendingIntent.getService(
            this,
            action.hashCode(),
            Intent(this, PlaybackService::class.java).setAction(action),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return Notification.Action.Builder(icon, label, intent).build()
    }

    private fun buildNotification(state: String): Notification {
        val playing = state == "playing" || state == "loading"
        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_waveflow)
            .setContentTitle(title.ifEmpty { "WaveFlow" })
            .setContentText(artist)
            .setSubText(album)
            .setContentIntent(openAppIntent())
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .addAction(action(android.R.drawable.ic_media_previous, "Previous", ACTION_PREVIOUS))
            .addAction(
                if (playing) {
                    action(android.R.drawable.ic_media_pause, "Pause", ACTION_TOGGLE)
                } else {
                    action(android.R.drawable.ic_media_play, "Play", ACTION_TOGGLE)
                }
            )
            .addAction(action(android.R.drawable.ic_media_next, "Next", ACTION_NEXT))
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
        cover?.let { builder.setLargeIcon(it) }
        return builder.build()
    }
}
