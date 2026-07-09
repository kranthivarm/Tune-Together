package com.tunetogether.tunetogether

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioPlaybackCapture
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import androidx.annotation.RequiresApi
import java.nio.ByteBuffer

/**
 * Captures system audio using Android MediaProjection API (Android 10+)
 * 
 * IMPORTANT: This captures ALL audio playing on the device, including:
 * - Music apps (Spotify, YouTube Music, etc.)
 * - Video apps (YouTube, Netflix, etc.)
 * - Games
 * - System sounds
 * 
 * Some apps may block audio capture by setting FLAG_SECURE or similar.
 */
@RequiresApi(Build.VERSION_CODES.Q)
class AudioCaptureService(
    private val context: Context,
    private val resultCode: Int,
    private val data: Intent
) {
    private var mediaProjection: MediaProjection? = null
    private var audioRecord: AudioRecord? = null
    private var isCapturing = false
    private var captureThread: Thread? = null

    companion object {
        private const val SAMPLE_RATE = 48000 // 48kHz - standard for LiveKit
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_STEREO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val BUFFER_SIZE_MULTIPLIER = 2
    }

    fun startCapture(onAudioData: (ByteArray) -> Unit) {
        if (isCapturing) return

        val mediaProjectionManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, data)

        if (mediaProjection == null) {
            throw IllegalStateException("Failed to create MediaProjection")
        }

        val minBufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            CHANNEL_CONFIG,
            AUDIO_FORMAT
        )

        val bufferSize = minBufferSize * BUFFER_SIZE_MULTIPLIER

        // Build AudioPlaybackCapture configuration
        val config = AudioPlaybackCapture.Builder(mediaProjection!!)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AUDIO_FORMAT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(CHANNEL_CONFIG)
                    .build()
            )
            .build()

        // Create AudioRecord with playback capture
        audioRecord = AudioRecord.Builder()
            .setAudioPlaybackCaptureConfig(config)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AUDIO_FORMAT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(CHANNEL_CONFIG)
                    .build()
            )
            .setBufferSizeInBytes(bufferSize)
            .build()

        audioRecord?.startRecording()
        isCapturing = true

        // Start capture thread
        captureThread = Thread {
            val buffer = ByteArray(bufferSize)
            
            while (isCapturing) {
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                
                if (read > 0) {
                    // Send audio data to Flutter
                    val audioData = buffer.copyOf(read)
                    onAudioData(audioData)
                } else if (read == AudioRecord.ERROR_INVALID_OPERATION) {
                    // Some apps block audio capture
                    println("Audio capture blocked by app or system")
                    break
                }
            }
        }
        captureThread?.start()
    }

    fun stopCapture() {
        isCapturing = false
        captureThread?.interrupt()
        captureThread = null

        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null

        mediaProjection?.stop()
        mediaProjection = null
    }
}
