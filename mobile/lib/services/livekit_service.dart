import 'dart:async';
import 'package:livekit_client/livekit_client.dart';
import 'package:just_audio/just_audio.dart';

class LiveKitService {
  Room? _room;
  LocalAudioTrack? _localAudioTrack;
  RemoteAudioTrack? _remoteAudioTrack;
  AudioPlayer? _audioPlayer;

  final _connectionStateController = StreamController<ConnectionState>.broadcast();
  Stream<ConnectionState> get connectionState => _connectionStateController.stream;

  final _remoteAudioController = StreamController<RemoteAudioTrack?>.broadcast();
  Stream<RemoteAudioTrack?> get remoteAudioStream => _remoteAudioController.stream;

  // Playback state
  final _playbackStateController = StreamController<PlaybackState>.broadcast();
  Stream<PlaybackState> get playbackState => _playbackStateController.stream;

  bool get isConnected => _room?.connectionState == ConnectionState.connected;
  bool get isPublishing => _localAudioTrack != null;

  AudioPlayer? get audioPlayer => _audioPlayer;

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
          echoCancellation: false,
          noiseSuppression: false,
        ),
      ),
    );

    // Listen to room events
    _room!.addListener(_onRoomUpdate);

    // Track subscribed event for members
    _room!.on<TrackSubscribedEvent>((event) {
      if (event.track is RemoteAudioTrack) {
        _remoteAudioTrack = event.track as RemoteAudioTrack;
        _remoteAudioController.add(_remoteAudioTrack);
        print('Subscribed to host audio track');
      }
    });

    _room!.on<TrackUnsubscribedEvent>((event) {
      if (event.track is RemoteAudioTrack) {
        _remoteAudioTrack = null;
        _remoteAudioController.add(null);
      }
    });

    _connectionStateController.add(_room!.connectionState);
  }

  /// Disconnect from LiveKit
  Future<void> disconnect() async {
    await _stopPublishing();
    await _room?.disconnect();
    _room = null;
    _audioPlayer?.dispose();
    _audioPlayer = null;
  }

  /// HOST: Start publishing audio from a local file
  ///
  /// Pipeline: just_audio plays file → system audio output → 
  /// LiveKit captures via default audio input.
  ///
  /// On Android, we use the media audio session which LiveKit
  /// can capture. The actual audio piping happens at the OS level.
  Future<void> startPublishingFromFile(String filePath) async {
    if (_room == null) throw Exception('Not connected to room');

    // Stop any existing publishing
    await _stopPublishing();

    // Create audio player for the local file
    _audioPlayer = AudioPlayer();
    await _audioPlayer!.setFilePath(filePath);

    // Create a local audio track from the default audio input
    // On Android, this captures the app's audio output when
    // configured with the right AudioSession settings
    _localAudioTrack = await LocalAudioTrack.create(
      const AudioCaptureOptions(
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      ),
    );
    await _room!.localParticipant?.publishAudioTrack(_localAudioTrack!);

    // Listen to player state changes
    _audioPlayer!.playerStateStream.listen((state) {
      _playbackStateController.add(PlaybackState(
        isPlaying: state.playing,
        processingState: state.processingState,
        position: _audioPlayer?.position ?? Duration.zero,
        duration: _audioPlayer?.duration ?? Duration.zero,
      ));
    });

    print('Publishing audio from: $filePath');
  }

  /// HOST: Play the loaded file
  Future<void> play() async {
    await _audioPlayer?.play();
  }

  /// HOST: Pause playback
  Future<void> pause() async {
    await _audioPlayer?.pause();
  }

  /// HOST: Seek to position
  Future<void> seek(Duration position) async {
    await _audioPlayer?.seek(position);
  }

  /// HOST: Stop playback
  Future<void> stop() async {
    await _audioPlayer?.stop();
  }

  /// Get current playback position
  Duration? get currentPosition => _audioPlayer?.position;

  /// Get total duration
  Duration? get totalDuration => _audioPlayer?.duration;

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
  }

  /// Handle room updates
  void _onRoomUpdate() {
    if (_room == null) return;
    _connectionStateController.add(_room!.connectionState);
  }

  void dispose() {
    _stopPublishing();
    _room?.dispose();
    _connectionStateController.close();
    _remoteAudioController.close();
    _playbackStateController.close();
  }
}

/// Simplified playback state
class PlaybackState {
  final bool isPlaying;
  final ProcessingState processingState;
  final Duration position;
  final Duration duration;

  PlaybackState({
    required this.isPlaying,
    required this.processingState,
    required this.position,
    required this.duration,
  });
}
