package app.waveflow.unofficial

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
    private var webViewRef: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        fitContentToSystemBars()
        setChrome("#121212", false)

        // Back closes whatever the interface has open (a sheet, a panel, a
        // detail page). Only when it has nothing left does the app go to
        // the background, and it is never finished: the audio engine lives
        // in this process.
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    val webView = webViewRef
                    if (webView == null) {
                        moveTaskToBack(true)
                        return
                    }
                    webView.evaluateJavascript(
                        "(function(){try{return window.__waveflowBack?!!window.__waveflowBack():false}catch(e){return false}})()"
                    ) { handled ->
                        if (handled != "true") moveTaskToBack(true)
                    }
                }
            }
        )

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 40)
        }
    }

    override fun onStart() {
        super.onStart()
        PlaybackService.start(this)
    }

    override fun onWebViewCreate(webView: WebView) {
        webViewRef = webView
        webView.addJavascriptInterface(Bridge(), "WaveFlowAndroid")
        webView.overScrollMode = View.OVER_SCROLL_NEVER
    }

    /**
     * Draw behind the system bars ourselves and pad the content by their
     * size (and by the keyboard's), so the layout is the same whether or
     * not the platform enforces edge-to-edge.
     */
    private fun fitContentToSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val content = findViewById<View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout() or
                    WindowInsetsCompat.Type.ime()
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    /** Colour behind the status and navigation bars, and their icon tint. */
    private fun setChrome(color: String, lightBackground: Boolean) {
        val parsed = try {
            Color.parseColor(color)
        } catch (_: Exception) {
            Color.parseColor("#121212")
        }
        findViewById<View>(android.R.id.content).setBackgroundColor(parsed)
        window.decorView.setBackgroundColor(parsed)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = lightBackground
        controller.isAppearanceLightNavigationBars = lightBackground
    }

    private fun hasStorageAccess(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) ==
                PackageManager.PERMISSION_GRANTED
        }

    private fun requestStorageAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            } catch (_: Exception) {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        } else {
            requestPermissions(
                arrayOf(
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                ),
                41
            )
        }
    }

    /** What the interface can ask of the platform, as `window.WaveFlowAndroid`. */
    inner class Bridge {
        @JavascriptInterface
        fun hasStorageAccess(): Boolean = this@MainActivity.hasStorageAccess()

        @JavascriptInterface
        fun requestStorageAccess() {
            runOnUiThread { this@MainActivity.requestStorageAccess() }
        }

        @JavascriptInterface
        fun moveToBackground() {
            runOnUiThread { moveTaskToBack(true) }
        }

        @JavascriptInterface
        fun setChrome(color: String, lightBackground: Boolean) {
            runOnUiThread { this@MainActivity.setChrome(color, lightBackground) }
        }

        @JavascriptInterface
        fun keepScreenOn(on: Boolean) {
            runOnUiThread {
                if (on) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }
        }

        @JavascriptInterface
        fun sdkInt(): Int = Build.VERSION.SDK_INT
    }
}
