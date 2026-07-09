import 'dart:async';
import 'package:livekit_client/livekit_client.dart';
import 'package:just_audio/just_audio.dart';
import 'media_projection_service.dart';

class LiveKitService {
  Room? _room;
  LocalAudioTrack? _localAudioTrack;
  RemoteAudioTrack? _remoteAudioTrack;
  AudioPlayer? _audioPlayer; // For playing local files
  MediaProjectionService? _mediaProjectionService;
  
  final _connectionStateController = StreamController<ConnectionState>.broadcast();
  Stream<ConnectionState> get connectionState => _connectionStateController.stream;

  final _remoteAudioController = StreamController<RemoteAudioTrack?>.broadcast();
  Stream<RemoteAudioTrack?> get remoteAudioStream => _remoteAudioController.stream;

  bool get isConnected => _room?.connectionState == ConnectionState.connected;
  bool get isPublishing => _localAudioTrack != null;

  /// Connect to LiveKit room with token
  Future<void> connect({
    required String url,
    required String token,
    required bool isHost,
  }) async {
    _room = await LiveKitClient.connect(
      url,
      token,
      roomOptions: const RoomOptions(
        defaultAudioPublishOptions: AudioPublishOptions(
          name: 'host-audio',
        ),
        defaultAudioCaptureOptions: AudioCaptureOptions(
          echoCancellation: false, // We want raw audio
          noiseSuppression: false,
        ),
      ),
    );

    // Listen to room events
    _room!.addListener(_onRoomUpdate);

    // Subscribe to remote audio tracks (for members)
    if (!isHost) {
      _room!.remoteParticipants.forEach((participantId, participant) {
        _subscribeToParticipant(participant);
      });
    }

    _connectionStateController.add(_room!.connectionState);
  }

  /// Disconnect from LiveKit
  Future<void> disconnect() async {
    await _stopPublishing();
    await _room?.disconnect();
    _room = null;
    _audioPlayer?.dispose();
    _audioPlayer = null;
    _mediaProjectionService?.dispose();
    _mediaProjectionService = null;
  }

  /// HOST: Start publishing audio from a local file
  Future<void> startPublishingFromFile(String filePath) async {
    if (_room == null) throw Exception('Not connected to room');

    // Stop any existing publishing
    await _stopPublishing();

    // Create audio player for the local file
    _audioPlayer = AudioPlayer();
    await _audioPlayer!.setFilePath(filePath);

    // Create a custom audio source from the player
    // Note: This requires custom implementation to pipe AudioPlayer output
    // into LiveKit's audio track. This is a simplified placeholder.
    
    // In production, you would:
    // 1. Use platform channels to capture AudioPlayer output as PCM
    // 2. Create a custom AudioSource that feeds this PCM data
    // 3. Publish it as a LocalAudioTrack

    // For now, we'll use microphone as a placeholder
    // TODO: Implement custom audio track from file
    _localAudioTrack = await LocalAudioTrack.create(const AudioCaptureOptions());
    await _room!.localParticipant?.publishAudioTrack(_localAudioTrack!);

    print('⚠️ Publishing from file requires custom audio pipeline implementation');
  }

  /// HOST: Start publishing system audio (Android MediaProjection)
  Future<void> startPublishingSystemAudio() async {
    if (_room == null) throw Exception('Not connected to room');

    await _stopPublishing();

    // Check if MediaProjection is supported
    if (!MediaProjectionService.isSupported()) {
      throw UnsupportedError(
        'System audio capture is only available on Android. '
        'iOS does not allow third-party apps to capture system audio.'
      );
    }

    // Initialize MediaProjection service
    _mediaProjectionService = MediaProjectionService();
    
    // Request permission (shows system dialog)
    final hasPermission = await _mediaProjectionService!.requestPermission();
    if (!hasPermission) {
      throw Exception(
        'MediaProjection permission denied. '
        'This permission is required to capture device audio.'
      );
    }

    // Start capturing system audio
    await _mediaProjectionService!.startCapture();

    // Create a custom audio track from MediaProjection PCM data
    // TODO: Implement custom AudioSource that pipes MediaProjection audio into LiveKit
    // For now, using microphone as placeholder
    _localAudioTrack = await LocalAudioTrack.create(const AudioCaptureOptions());
    await _room!.localParticipant?.publishAudioTrack(_localAudioTrack!);

    // Listen to audio data and feed into LiveKit track
    _mediaProjectionService!.audioDataStream.listen((pcmData) {
      // TODO: Feed PCM data into LiveKit audio track
      // This requires a custom AudioSource implementation
    });

    print('⚠️ System audio capture implementation needs custom AudioSource bridge');
  }

  /// Stop publishing audio
  Future<void> _stopPublishing() async {
    if (_localAudioTrack != null) {
      await _room?.localParticipant?.unpublishTrack(_localAudioTrack!.sid);
      await _localAudioTrack?.stop();
      _localAudioTrack = null;
    }
    await _audioPlayer?.stop();
    await _audioPlayer?.dispose();
    _audioPlayer = null;
    
    await _mediaProjectionService?.stopCapture();
    _mediaProjectionService?.dispose();
    _mediaProjectionService = null;
  }

  /// Subscribe to a remote participant's audio
  void _subscribeToParticipant(RemoteParticipant participant) {
    participant.addListener(() {
      for (final trackPublication in participant.audioTracks) {
        if (trackPublication.track != null && trackPublication.track is RemoteAudioTrack) {
          _remoteAudioTrack = trackPublication.track as RemoteAudioTrack;
          _remoteAudioController.add(_remoteAudioTrack);
          print('Subscribed to remote audio track');
        }
      }
    });
  }

  /// Handle room updates
  void _onRoomUpdate() {
    if (_room == null) return;

    _connectionStateController.add(_room!.connectionState);

    // Handle new participants joining (for members to receive host audio)
    for (final participant in _room!.remoteParticipants.values) {
      _subscribeToParticipant(participant);
    }
  }

  /// Play audio at a specific timestamp (for sync)
  Future<void> playAtTime(int timestampMs) async {
    if (_audioPlayer == null) return;
    
    final now = DateTime.now().millisecondsSinceEpoch;
    final delayMs = timestampMs - now;

    if (delayMs > 0) {
      await Future.delayed(Duration(milliseconds: delayMs));
    }

    await _audioPlayer!.play();
  }

  /// Pause audio playback
  Future<void> pause() async {
    await _audioPlayer?.pause();
  }

  /// Seek to position
  Future<void> seek(Duration position) async {
    await _audioPlayer?.seek(position);
  }

  /// Get current playback position
  Duration? get currentPosition => _audioPlayer?.position;

  void dispose() {
    _stopPublishing();
    _room?.dispose();
    _connectionStateController.close();
    _remoteAudioController.close();
  }
}
