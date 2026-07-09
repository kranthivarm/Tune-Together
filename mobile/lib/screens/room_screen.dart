import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/auth.dart';
import '../models/room.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../services/livekit_service.dart';
import '../services/audio_file_service.dart';

class RoomScreen extends StatefulWidget {
  final AuthToken auth;

  const RoomScreen({super.key, required this.auth});

  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> {
  late final ApiService _apiService;
  late final WebSocketService _wsService;
  late final LiveKitService _liveKitService;
  late final AudioFileService _audioFileService;

  Room? _room;
  List<PlaylistTrack> _localPlaylist = [];
  Map<String, String> _trackFilePaths = {}; // trackId -> local file path
  PlaylistTrack? _currentTrack;
  bool _isPlaying = false;
  bool _isLoading = true;
  String? _errorMessage;
  int _clockOffsetMs = 0;
  
  // Mirror mode state (Phase 5 - Android only)
  bool _isMirrorMode = false;
  bool _isMirrorModeAvailable = false;

  @override
  void initState() {
    super.initState();
    _apiService = ApiService();
    _apiService.setAuthToken(widget.auth.token);
    _wsService = WebSocketService();
    _liveKitService = LiveKitService();
    _audioFileService = AudioFileService();
    
    _isMirrorModeAvailable = Platform.isAndroid;
    
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      // 1. Fetch room state from API
      _room = await _apiService.getRoomState(widget.auth.roomCode);
      _localPlaylist = List.from(_room!.playlist);

      // 2. Connect to WebSocket
      await _wsService.connect(widget.auth.token);
      _setupWebSocketListeners();

      // 3. Connect to LiveKit
      // Note: Need to get LiveKit token from backend
      // For now, this is a placeholder
      // await _liveKitService.connect(
      //   url: 'ws://localhost:7880',
      //   token: '<livekit-token>',
      //   isHost: widget.auth.isHost,
      // );

      setState(() {
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  void _setupWebSocketListeners() {
    // Listen to WebSocket messages
    _wsService.messages.listen((message) {
      switch (message.type) {
        case WSMessageType.playCommand:
          _handlePlayCommand(message.payload);
          break;
        case WSMessageType.pauseCommand:
          _handlePauseCommand();
          break;
        case WSMessageType.seekCommand:
          _handleSeekCommand(message.payload);
          break;
        case WSMessageType.skipCommand:
          _handleSkipCommand(message.payload);
          break;
        case WSMessageType.playlistUpdated:
          _refreshRoomState();
          break;
        case WSMessageType.memberJoined:
        case WSMessageType.memberLeft:
          _refreshRoomState();
          break;
        case WSMessageType.mirrorModeStarted:
          setState(() => _isMirrorMode = true);
          break;
        case WSMessageType.mirrorModeStopped:
          setState(() => _isMirrorMode = false);
          break;
        default:
          break;
      }
    });

    // Listen to clock sync updates
    _wsService.clockSync.listen((sync) {
      setState(() {
        _clockOffsetMs = sync.offsetMs;
      });
      print('Clock sync: offset=${sync.offsetMs}ms, rtt=${sync.rttMs}ms');
    });
  }

  void _handlePlayCommand(Map<String, dynamic> payload) {
    final trackId = payload['trackId'] as String;
    final track = _localPlaylist.firstWhere((t) => t.id == trackId);
    setState(() {
      _currentTrack = track;
      _isPlaying = true;
    });
    // TODO: Start audio playback via LiveKit
  }

  void _handlePauseCommand() {
    setState(() => _isPlaying = false);
    // TODO: Pause audio via LiveKit
  }

  void _handleSeekCommand(Map<String, dynamic> payload) {
    final positionMs = payload['positionMs'] as int;
    // TODO: Seek audio via LiveKit
  }

  void _handleSkipCommand(Map<String, dynamic> payload) {
    final trackId = payload['trackId'] as String;
    final track = _localPlaylist.firstWhere((t) => t.id == trackId);
    setState(() => _currentTrack = track);
  }

  Future<void> _refreshRoomState() async {
    try {
      final room = await _apiService.getRoomState(widget.auth.roomCode);
      setState(() {
        _room = room;
        _localPlaylist = List.from(room.playlist);
      });
    } catch (e) {
      print('Error refreshing room state: $e');
    }
  }

  Future<void> _addAudioFiles() async {
    // Request storage permission
    final hasPermission = await _audioFileService.requestStoragePermission();
    if (!hasPermission) {
      _showError('Storage permission is required to access audio files');
      return;
    }

    // Pick files
    final files = await _audioFileService.pickAudioFiles();
    if (files.isEmpty) return;

    try {
      // Add each file's metadata to server
      for (final file in files) {
        final track = await _apiService.addTrackMetadata(
          roomCode: widget.auth.roomCode,
          clientTrackId: file.id,
          title: file.title,
          artist: file.artist,
          durationMs: file.durationMs,
        );

        // Store local file path mapping (never sent to server)
        _trackFilePaths[file.id] = file.path;
        
        setState(() {
          _localPlaylist.add(track.copyWith(localFilePath: file.path));
        });
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added ${files.length} track(s) to playlist')),
      );
    } catch (e) {
      _showError('Failed to add tracks: $e');
    }
  }

  Future<void> _playTrack(PlaylistTrack track) async {
    if (!widget.auth.isHost) return;

    setState(() {
      _currentTrack = track;
      _isPlaying = true;
    });

    // Send play command via WebSocket
    _wsService.sendPlay(trackId: track.id);

    // Start publishing audio via LiveKit
    final filePath = _trackFilePaths[track.id] ?? track.localFilePath;
    if (filePath != null) {
      await _liveKitService.startPublishingFromFile(filePath);
    }
  }

  Future<void> _pausePlayback() async {
    if (!widget.auth.isHost) return;

    setState(() => _isPlaying = false);
    _wsService.sendPause();
    await _liveKitService.pause();
  }

  Future<void> _startMirrorMode() async {
    if (!widget.auth.isHost || !_isMirrorModeAvailable) return;

    try {
      // Start system audio capture (Android MediaProjection)
      await _liveKitService.startPublishingSystemAudio();
      
      setState(() => _isMirrorMode = true);
      _wsService.sendStartMirrorMode();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Device audio mirroring started'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      _showError('Failed to start mirror mode: $e');
    }
  }

  Future<void> _stopMirrorMode() async {
    if (!widget.auth.isHost) return;

    await _liveKitService.disconnect();
    setState(() => _isMirrorMode = false);
    _wsService.sendStopMirrorMode();
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  Future<void> _leaveRoom() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(widget.auth.isHost ? 'Close Room?' : 'Leave Room?'),
        content: Text(
          widget.auth.isHost
              ? 'This will end the session for all members.'
              : 'Are you sure you want to leave?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: Text(widget.auth.isHost ? 'Close Room' : 'Leave'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      if (widget.auth.isHost) {
        await _apiService.closeRoom(widget.auth.roomCode);
      }
      _wsService.disconnect();
      await _liveKitService.disconnect();
      if (mounted) {
        Navigator.popUntil(context, (route) => route.isFirst);
      }
    }
  }

  @override
  void dispose() {
    _wsService.dispose();
    _liveKitService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Loading...')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_errorMessage != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Error')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              Text(_errorMessage!),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Go Back'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_room?.name ?? widget.auth.roomCode),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.people),
            onPressed: () => _showMembersDialog(),
          ),
          IconButton(
            icon: const Icon(Icons.exit_to_app),
            onPressed: _leaveRoom,
          ),
        ],
      ),
      body: Column(
        children: [
          // Room Code Card
          _buildRoomCodeCard(),

          // Mirror Mode Banner (Android only, Host only)
          if (widget.auth.isHost && _isMirrorModeAvailable && !_isMirrorMode)
            _buildMirrorModeBanner(),

          if (_isMirrorMode)
            _buildActiveMirrorBanner(),

          // Now Playing Card
          if (_currentTrack != null && !_isMirrorMode)
            _buildNowPlayingCard(),

          // Playlist
          if (!_isMirrorMode)
            Expanded(child: _buildPlaylist()),
        ],
      ),
      floatingActionButton: widget.auth.isHost && !_isMirrorMode
          ? FloatingActionButton.extended(
              onPressed: _addAudioFiles,
              backgroundColor: Colors.deepPurple,
              label: const Text('Add Tracks'),
              icon: const Icon(Icons.add),
            )
          : null,
    );
  }

  Widget _buildRoomCodeCard() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.deepPurple.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.deepPurple.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.share, color: Colors.deepPurple.shade700),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Room Code',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              Text(
                widget.auth.roomCode,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Colors.deepPurple.shade700,
                ),
              ),
            ],
          ),
          const Spacer(),
          TextButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: widget.auth.roomCode));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Room code copied!')),
              );
            },
            icon: const Icon(Icons.copy, size: 18),
            label: const Text('Copy'),
          ),
        ],
      ),
    );
  }

  Widget _buildMirrorModeBanner() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: ElevatedButton.icon(
        onPressed: _startMirrorMode,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.orange,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.all(16),
        ),
        icon: const Icon(Icons.screen_share),
        label: const Text('Start Device Audio Mirroring'),
      ),
    );
  }

  Widget _buildActiveMirrorBanner() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.screen_share, color: Colors.orange.shade700),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Device audio is being mirrored to all members',
              style: TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          if (widget.auth.isHost)
            TextButton(
              onPressed: _stopMirrorMode,
              child: const Text('Stop'),
            ),
        ],
      ),
    );
  }

  Widget _buildNowPlayingCard() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.deepPurple.shade400, Colors.deepPurple.shade600],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          const Text(
            'NOW PLAYING',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _currentTrack!.title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
            textAlign: TextAlign.center,
          ),
          Text(
            _currentTrack!.artist,
            style: const TextStyle(color: Colors.white70, fontSize: 14),
          ),
          if (widget.auth.isHost) ...[
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  icon: const Icon(Icons.skip_previous, color: Colors.white),
                  onPressed: () {/* TODO */},
                ),
                IconButton(
                  icon: Icon(
                    _isPlaying ? Icons.pause_circle : Icons.play_circle,
                    color: Colors.white,
                    size: 48,
                  ),
                  onPressed: _isPlaying ? _pausePlayback : () => _playTrack(_currentTrack!),
                ),
                IconButton(
                  icon: const Icon(Icons.skip_next, color: Colors.white),
                  onPressed: () {/* TODO */},
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPlaylist() {
    if (_localPlaylist.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.music_note, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              widget.auth.isHost
                  ? 'No tracks yet.\nTap "Add Tracks" to get started.'
                  : 'Waiting for host to add tracks...',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      itemCount: _localPlaylist.length,
      itemBuilder: (context, index) {
        final track = _localPlaylist[index];
        final isCurrentTrack = _currentTrack?.id == track.id;

        return ListTile(
          leading: CircleAvatar(
            backgroundColor: isCurrentTrack ? Colors.deepPurple : Colors.grey.shade300,
            child: Icon(
              isCurrentTrack && _isPlaying ? Icons.equalizer : Icons.music_note,
              color: isCurrentTrack ? Colors.white : Colors.grey.shade700,
            ),
          ),
          title: Text(
            track.title,
            style: TextStyle(
              fontWeight: isCurrentTrack ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          subtitle: Text('${track.artist} • ${track.formattedDuration}'),
          trailing: widget.auth.isHost
              ? IconButton(
                  icon: const Icon(Icons.play_arrow),
                  onPressed: () => _playTrack(track),
                )
              : null,
          onTap: widget.auth.isHost ? () => _playTrack(track) : null,
        );
      },
    );
  }

  void _showMembersDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Room Members'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: _room?.members.length ?? 0,
            itemBuilder: (context, index) {
              final member = _room!.members[index];
              return ListTile(
                leading: CircleAvatar(
                  child: Text(member.displayName[0].toUpperCase()),
                ),
                title: Text(member.displayName),
                trailing: member.isHost
                    ? const Chip(
                        label: Text('HOST', style: TextStyle(fontSize: 10)),
                        padding: EdgeInsets.zero,
                      )
                    : null,
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

extension on PlaylistTrack {
  PlaylistTrack copyWith({String? localFilePath}) {
    return PlaylistTrack(
      id: id,
      title: title,
      artist: artist,
      durationMs: durationMs,
      orderIndex: orderIndex,
      localFilePath: localFilePath ?? this.localFilePath,
    );
  }
}
