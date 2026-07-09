import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/auth.dart';
import '../models/room.dart';

class ApiService {
  final String baseUrl;
  String? _authToken;

  ApiService({this.baseUrl = 'http://localhost:8080/api/v1'});

  void setAuthToken(String token) {
    _authToken = token;
  }

  Map<String, String> _headers({bool includeAuth = false}) {
    final headers = {
      'Content-Type': 'application/json',
    };
    if (includeAuth && _authToken != null) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  /// POST /rooms — Create a new room
  Future<AuthToken> createRoom({
    required String displayName,
    String? roomName,
    String? password,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/rooms'),
      headers: _headers(),
      body: jsonEncode({
        'displayName': displayName,
        if (roomName != null) 'roomName': roomName,
        if (password != null) 'password': password,
      }),
    );

    if (response.statusCode == 201) {
      final data = jsonDecode(response.body);
      final auth = AuthToken.fromResponse(data);
      setAuthToken(auth.token);
      return auth;
    } else {
      throw ApiException(
        statusCode: response.statusCode,
        message: _extractErrorMessage(response),
      );
    }
  }

  /// POST /rooms/{code}/join — Join an existing room
  Future<AuthToken> joinRoom({
    required String roomCode,
    required String displayName,
    String? password,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/rooms/$roomCode/join'),
      headers: _headers(),
      body: jsonEncode({
        'displayName': displayName,
        if (password != null) 'password': password,
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      final auth = AuthToken.fromResponse(data);
      setAuthToken(auth.token);
      return auth;
    } else {
      throw ApiException(
        statusCode: response.statusCode,
        message: _extractErrorMessage(response),
      );
    }
  }

  /// GET /rooms/{code} — Get room state
  Future<Room> getRoomState(String roomCode) async {
    final response = await http.get(
      Uri.parse('$baseUrl/rooms/$roomCode'),
      headers: _headers(includeAuth: true),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return Room.fromJson(data);
    } else {
      throw ApiException(
        statusCode: response.statusCode,
        message: _extractErrorMessage(response),
      );
    }
  }

  /// POST /rooms/{code}/playlist — Add track metadata
  Future<PlaylistTrack> addTrackMetadata({
    required String roomCode,
    required String clientTrackId,
    required String title,
    required String artist,
    required int durationMs,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/rooms/$roomCode/playlist'),
      headers: _headers(includeAuth: true),
      body: jsonEncode({
        'clientTrackId': clientTrackId,
        'title': title,
        'artist': artist,
        'durationMs': durationMs,
      }),
    );

    if (response.statusCode == 201) {
      final data = jsonDecode(response.body);
      return PlaylistTrack.fromJson(data);
    } else {
      throw ApiException(
        statusCode: response.statusCode,
        message: _extractErrorMessage(response),
      );
    }
  }

  /// PUT /rooms/{code}/playlist — Reorder playlist
  Future<List<PlaylistTrack>> reorderPlaylist({
    required String roomCode,
    required List<String> trackIds,
  }) async {
    final response = await http.put(
      Uri.parse('$baseUrl/rooms/$roomCode/playlist'),
      headers: _headers(includeAuth: true),
      body: jsonEncode({
        'trackIds': trackIds,
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as List;
      return data.map((t) => PlaylistTrack.fromJson(t)).toList();
    } else {
      throw ApiException(
        statusCode: response.statusCode,
        message: _extractErrorMessage(response),
      );
    }
  }

  /// DELETE /rooms/{code}/playlist/{trackId} — Remove track
  Future<void> removeTrack({
    required String roomCode,
    required String trackId,
  }) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/rooms/$roomCode/playlist/$trackId'),
      headers: _headers(includeAuth: true),
    );

    if (response.statusCode != 204) {
      throw ApiException(
        statusCode: response.statusCode,
        message: _extractErrorMessage(response),
      );
    }
  }

  /// DELETE /rooms/{code} — Close room
  Future<void> closeRoom(String roomCode) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/rooms/$roomCode'),
      headers: _headers(includeAuth: true),
    );

    if (response.statusCode != 204) {
      throw ApiException(
        statusCode: response.statusCode,
        message: _extractErrorMessage(response),
      );
    }
  }

  String _extractErrorMessage(http.Response response) {
    try {
      final data = jsonDecode(response.body);
      return data['message'] ?? data['error'] ?? 'Unknown error';
    } catch (e) {
      return 'HTTP ${response.statusCode}';
    }
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String message;

  ApiException({required this.statusCode, required this.message});

  @override
  String toString() => 'ApiException($statusCode): $message';
}
