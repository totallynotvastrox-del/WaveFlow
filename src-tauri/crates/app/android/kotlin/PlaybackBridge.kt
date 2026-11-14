package app.waveflow.unofficial

/**
 * The two JNI functions the Rust side exports for the playback service
 * (`src/android/media_controls.rs`). They live in the same shared library
 * the activity loads, so they resolve once the app has started.
 */
object PlaybackBridge {
    /** What is playing, as one JSON object. */
    @JvmStatic
    external fun nativeState(): String

    /** 0 toggle, 1 play, 2 pause, 3 next, 4 previous, 5 seek (arg = ms), 6 stop. */
    @JvmStatic
    external fun nativeAction(action: Int, arg: Long)

    const val TOGGLE = 0
    const val PLAY = 1
    const val PAUSE = 2
    const val NEXT = 3
    const val PREVIOUS = 4
    const val SEEK = 5
    const val STOP = 6

    fun act(action: Int, arg: Long = 0L) {
        try {
            nativeAction(action, arg)
        } catch (_: Throwable) {
            // The library is not loaded yet (or the process is going away).
        }
    }

    fun state(): String? =
        try {
            nativeState()
        } catch (_: Throwable) {
            null
        }
}
