package com.tunetogether.tunetogether

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.EventChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.tunetogether/media_projection"
    private val EVENT_CHANNEL = "com.tunetogether/media_projection_audio"
    private val REQUEST_MEDIA_PROJECTION = 1001
    
    private var methodResult: MethodChannel.Result? = null
    private var audioCapture: AudioCaptureService? = null
    private var eventSink: EventChannel.EventSink? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        
        // Method Channel for control
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "requestPermission" -> {
                    methodResult = result
                    requestMediaProjectionPermission()
                }
                "startCapture" -> {
                    startAudioCapture()
                    result.success(null)
                }
                "stopCapture" -> {
                    stopAudioCapture()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
        
        // Event Channel for audio data
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, EVENT_CHANNEL).setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    eventSink = events
                }

                override fun onCancel(arguments: Any?) {
                    eventSink = null
                }
            }
        )
    }

    private fun requestMediaProjectionPermission() {
        val mediaProjectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val intent = mediaProjectionManager.createScreenCaptureIntent()
        startActivityForResult(intent, REQUEST_MEDIA_PROJECTION)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                // Permission granted - initialize audio capture service
                audioCapture = AudioCaptureService(this, resultCode, data)
                methodResult?.success(true)
            } else {
                // Permission denied
                methodResult?.success(false)
            }
            methodResult = null
        }
    }

    private fun startAudioCapture() {
        audioCapture?.startCapture { audioData ->
            // Send audio data to Flutter via EventChannel
            activity?.runOnUiThread {
                eventSink?.success(audioData)
            }
        }
    }

    private fun stopAudioCapture() {
        audioCapture?.stopCapture()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAudioCapture()
    }
}
