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
  timeSyncResponse,
  startMirrorMode,
  stopMirrorMode,

  // Server → Client
  playCommand,
  pauseCommand,
  seekCommand,
  skipCommand,
  trackChanged,
  memberJoined,
  memberLeft,
  playlistUpdated,
  timeSyncRequest,
  timeSyncResult,
  mirrorModeStarted,
  mirrorModeStopped,
}

class WebSocketService {
  final String baseUrl;
  String? _authToken;
  WebSocketChannel? _channel;
  bool _isConnected = false;

  final _messageController = StreamController<WSMessage>.broadcast();
  Stream<WSMessage> get messages => _messageController.stream;

  final _clockOffsetController = StreamController<ClockSync>.broadcast();
  Stream<ClockSync> get clockSync => _clockOffsetController.stream;

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
      'type': type.name,
      if (payload != null) ...payload,
    };

    _channel!.sink.add(jsonEncode(message));
  }

  /// Handle incoming WebSocket messages
  void _handleMessage(dynamic data) {
    try {
      final json = jsonDecode(data as String);
      final typeStr = json['type'] as String?;

      if (typeStr == null) return;

      // Parse message type
      WSMessageType? type;
      try {
        type = WSMessageType.values.firstWhere((e) => e.name == typeStr);
      } catch (e) {
        print('Unknown message type: $typeStr');
        return;
      }

      // Handle clock sync separately
      if (type == WSMessageType.timeSyncRequest) {
        _handleTimeSyncRequest(json);
        return;
      } else if (type == WSMessageType.timeSyncResult) {
        _handleTimeSyncResult(json);
        return;
      }

      // Broadcast other messages
      _messageController.add(WSMessage(
        type: type,
        payload: json,
      ));
    } catch (e) {
      print('Error parsing WebSocket message: $e');
    }
  }

  /// Handle time sync request from server (NTP-style handshake)
  void _handleTimeSyncRequest(Map<String, dynamic> json) {
    final t1 = json['t1'] as int; // Server sent time
    final t2 = DateTime.now().millisecondsSinceEpoch; // Client receive time
    final t3 = DateTime.now().millisecondsSinceEpoch; // Client send time (immediate)

    send(WSMessageType.timeSyncResponse, payload: {
      't1': t1,
      't2': t2,
      't3': t3,
    });
  }

  /// Handle time sync result from server
  void _handleTimeSyncResult(Map<String, dynamic> json) {
    final offsetMs = json['offsetMs'] as int;
    final rttMs = json['rttMs'] as int;

    _clockOffsetController.add(ClockSync(
      offsetMs: offsetMs,
      rttMs: rttMs,
    ));
  }

  /// Host: Send play command
  void sendPlay({required String trackId, int? positionMs}) {
    send(WSMessageType.play, payload: {
      'trackId': trackId,
      if (positionMs != null) 'positionMs': positionMs,
      'hostTime': DateTime.now().millisecondsSinceEpoch,
    });
  }

  /// Host: Send pause command
  void sendPause({int? positionMs}) {
    send(WSMessageType.pause, payload: {
      if (positionMs != null) 'positionMs': positionMs,
    });
  }

  /// Host: Send seek command
  void sendSeek({required int positionMs}) {
    send(WSMessageType.seek, payload: {
      'positionMs': positionMs,
    });
  }

  /// Host: Send skip command (next/previous)
  void sendSkip({required String trackId}) {
    send(WSMessageType.skip, payload: {
      'trackId': trackId,
    });
  }

  /// Host: Start device audio mirroring mode
  void sendStartMirrorMode() {
    send(WSMessageType.startMirrorMode);
  }

  /// Host: Stop device audio mirroring mode
  void sendStopMirrorMode() {
    send(WSMessageType.stopMirrorMode);
  }

  void dispose() {
    disconnect();
    _messageController.close();
    _clockOffsetController.close();
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
