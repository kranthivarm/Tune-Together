import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;

enum WSMessageType {
  // Client → Server
  play,
  pause,
  seek,
  skip,
  trackChanged,
  timeSyncResponse,
  startMirrorMode,
  stopMirrorMode,

  // Server → Client
  playCommand,
  pauseCommand,
  seekCommand,
  skipCommand,
  memberJoined,
  memberLeft,
  playlistUpdated,
  timeSyncRequest,
  timeSyncResult,
  roomState,
  mirrorModeStarted,
  mirrorModeStopped,
}

/// Maps Go-backend snake_case message types to enum values
WSMessageType? _parseMessageType(String typeStr) {
  switch (typeStr) {
    case 'play': return WSMessageType.playCommand;
    case 'pause': return WSMessageType.pauseCommand;
    case 'seek': return WSMessageType.seekCommand;
    case 'skip': return WSMessageType.skipCommand;
    case 'track_changed': return WSMessageType.trackChanged;
    case 'member_joined': return WSMessageType.memberJoined;
    case 'member_left': return WSMessageType.memberLeft;
    case 'playlist_updated': return WSMessageType.playlistUpdated;
    case 'time_sync_request': return WSMessageType.timeSyncRequest;
    case 'time_sync_response': return WSMessageType.timeSyncResponse;
    case 'time_sync_result': return WSMessageType.timeSyncResult;
    case 'room_state': return WSMessageType.roomState;
    case 'mirror_mode_started': return WSMessageType.mirrorModeStarted;
    case 'mirror_mode_stopped': return WSMessageType.mirrorModeStopped;
    default:
      print('Unknown message type: $typeStr');
      return null;
  }
}

/// Maps enum values to Go-backend snake_case strings for sending
String _toWireType(WSMessageType type) {
  switch (type) {
    case WSMessageType.play: return 'play';
    case WSMessageType.pause: return 'pause';
    case WSMessageType.seek: return 'seek';
    case WSMessageType.skip: return 'skip';
    case WSMessageType.trackChanged: return 'track_changed';
    case WSMessageType.timeSyncResponse: return 'time_sync_response';
    case WSMessageType.startMirrorMode: return 'start_mirror_mode';
    case WSMessageType.stopMirrorMode: return 'stop_mirror_mode';
    default: return type.name;
  }
}

class WebSocketService {
  final String baseUrl;
  String? _authToken;
  WebSocketChannel? _channel;
  bool _isConnected = false;

  // LiveKit token received from room_state
  String? livekitToken;

  final _messageController = StreamController<WSMessage>.broadcast();
  Stream<WSMessage> get messages => _messageController.stream;

  final _clockOffsetController = StreamController<ClockSync>.broadcast();
  Stream<ClockSync> get clockSync => _clockOffsetController.stream;

  final _roomStateController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get roomState => _roomStateController.stream;

  WebSocketService({this.baseUrl = 'ws://localhost:8081/ws'});

  bool get isConnected => _isConnected;

  /// Connect to WebSocket server with auth token
  Future<void> connect(String authToken) async {
    _authToken = authToken;
    final uri = Uri.parse('$baseUrl?token=$authToken');

    try {
      _channel = WebSocketChannel.connect(uri);
      _isConnected = true;

      _channel!.stream.listen(
        _handleMessage,
        onError: (error) {
          print('WebSocket error: $error');
          _isConnected = false;
        },
        onDone: () {
          print('WebSocket closed');
          _isConnected = false;
        },
      );

      print('WebSocket connected');
    } catch (e) {
      _isConnected = false;
      rethrow;
    }
  }

  /// Disconnect from WebSocket
  void disconnect() {
    _channel?.sink.close(status.goingAway);
    _channel = null;
    _isConnected = false;
  }

  /// Send a message to the server
  void send(WSMessageType type, {Map<String, dynamic>? payload}) {
    if (!_isConnected) {
      throw Exception('WebSocket not connected');
    }

    final message = {
      'type': _toWireType(type),
      if (payload != null) 'payload': payload,
    };

    _channel!.sink.add(jsonEncode(message));
  }

  /// Handle incoming WebSocket messages
  void _handleMessage(dynamic data) {
    try {
      final json = jsonDecode(data as String);
      final typeStr = json['type'] as String?;

      if (typeStr == null) return;

      // Handle clock sync separately
      if (typeStr == 'time_sync_request') {
        _handleTimeSyncRequest(json);
        return;
      } else if (typeStr == 'time_sync_result') {
        _handleTimeSyncResult(json);
        return;
      }

      // Handle room_state (extract LiveKit token)
      if (typeStr == 'room_state') {
        final payload = (json['payload'] as Map<String, dynamic>?) ?? json;
        if (payload['livekitToken'] != null) {
          livekitToken = payload['livekitToken'] as String;
        }
        _roomStateController.add(payload);
        return;
      }

      // Parse other message types
      final type = _parseMessageType(typeStr);
      if (type == null) return;

      final payload = (json['payload'] as Map<String, dynamic>?) ?? json;

      _messageController.add(WSMessage(
        type: type,
        payload: payload,
      ));
    } catch (e) {
      print('Error parsing WebSocket message: $e');
    }
  }

  /// Handle time sync request from server (NTP-style handshake)
  void _handleTimeSyncRequest(Map<String, dynamic> json) {
    final payload = (json['payload'] as Map<String, dynamic>?) ?? json;
    final t1 = payload['t0'] as int? ?? payload['t1'] as int? ?? 0;
    final t2 = DateTime.now().millisecondsSinceEpoch;
    final t3 = DateTime.now().millisecondsSinceEpoch;

    send(WSMessageType.timeSyncResponse, payload: {
      't0': t1,
      't1': t1,
      't2': t2,
      't3': t3,
    });
  }

  /// Handle time sync result from server
  void _handleTimeSyncResult(Map<String, dynamic> json) {
    final payload = (json['payload'] as Map<String, dynamic>?) ?? json;
    final offsetMs = (payload['offsetMs'] as num?)?.toInt() ?? 0;
    final rttMs = (payload['rttMs'] as num?)?.toInt() ?? 0;

    _clockOffsetController.add(ClockSync(
      offsetMs: offsetMs,
      rttMs: rttMs,
    ));
  }

  // ─── Host Control Messages ────────────────────────────────

  void sendPlay({required String trackId, int? positionMs}) {
    send(WSMessageType.play, payload: {
      'trackId': trackId,
      if (positionMs != null) 'positionMs': positionMs,
      'hostTimestamp': DateTime.now().millisecondsSinceEpoch,
    });
  }

  void sendPause({int? positionMs}) {
    send(WSMessageType.pause, payload: {
      if (positionMs != null) 'positionMs': positionMs,
      'hostTimestamp': DateTime.now().millisecondsSinceEpoch,
    });
  }

  void sendSeek({required int positionMs}) {
    send(WSMessageType.seek, payload: {
      'positionMs': positionMs,
      'hostTimestamp': DateTime.now().millisecondsSinceEpoch,
    });
  }

  void sendSkip({required String trackId}) {
    send(WSMessageType.skip, payload: {
      'trackId': trackId,
    });
  }

  void sendTrackChanged({
    required String trackId,
    required int trackIndex,
    required String title,
    required String artist,
    required int durationMs,
  }) {
    send(WSMessageType.trackChanged, payload: {
      'trackId': trackId,
      'trackIndex': trackIndex,
      'title': title,
      'artist': artist,
      'durationMs': durationMs,
    });
  }

  void sendStartMirrorMode() {
    send(WSMessageType.startMirrorMode);
  }

  void sendStopMirrorMode() {
    send(WSMessageType.stopMirrorMode);
  }

  void dispose() {
    disconnect();
    _messageController.close();
    _clockOffsetController.close();
    _roomStateController.close();
  }
}

class WSMessage {
  final WSMessageType type;
  final Map<String, dynamic> payload;

  WSMessage({required this.type, required this.payload});
}

class ClockSync {
  final int offsetMs;
  final int rttMs;

  ClockSync({required this.offsetMs, required this.rttMs});
}
