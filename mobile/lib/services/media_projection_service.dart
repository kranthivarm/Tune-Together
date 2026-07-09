import 'dart:async';
import 'dart:io';
import 'package:flutter/services.dart';

/// Service for capturing system audio on Android using MediaProjection API
/// iOS does NOT support system-level audio capture for third-party apps
class MediaProjectionService {
  static const MethodChannel _channel = MethodChannel('com.tunetogether/media_projection');
  
  final _audioDataController = StreamController<List<int>>.broadcast();
  Stream<List<int>> get audioDataStream => _audioDataController.stream;

  bool _isCapturing = false;
  bool get isCapturing => _isCapturing;

  /// Check if device supports system audio capture
  /// Returns true only on Android
  static bool isSupported() {
    return Platform.isAndroid;
  }

  /// Request MediaProjection permission from user
  /// This will show the system screen capture permission dialog
  Future<bool> requestPermission() async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('MediaProjection is only available on Android');
    }

    try {
      final result = await _channel.invokeMethod<bool>('requestPermission');
      return result ?? false;
    } on PlatformException catch (e) {
      print('Failed to request MediaProjection permission: ${e.message}');
      return false;
    }
  }

  /// Start capturing system audio
  /// This captures ALL audio playing on the device, from any app
  Future<void> startCapture() async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('MediaProjection is only available on Android');
    }

    if (_isCapturing) {
      throw StateError('Audio capture is already running');
    }

    try {
      await _channel.invokeMethod('startCapture');
      _isCapturing = true;

      // Set up event channel to receive audio data
      const EventChannel audioEventChannel = EventChannel('com.tunetogether/media_projection_audio');
      audioEventChannel.receiveBroadcastStream().listen(
        (dynamic data) {
          if (data is List<int>) {
            _audioDataController.add(data);
          }
        },
        onError: (error) {
          print('Audio capture error: $error');
          _isCapturing = false;
        },
        onDone: () {
          _isCapturing = false;
        },
      );
    } on PlatformException catch (e) {
      print('Failed to start audio capture: ${e.message}');
      _isCapturing = false;
      rethrow;
    }
  }

  /// Stop capturing system audio
  Future<void> stopCapture() async {
    if (!Platform.isAndroid) return;

    try {
      await _channel.invokeMethod('stopCapture');
      _isCapturing = false;
    } on PlatformException catch (e) {
      print('Failed to stop audio capture: ${e.message}');
    }
  }

  void dispose() {
    stopCapture();
    _audioDataController.close();
  }
}
