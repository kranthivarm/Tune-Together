class Room {
  final String code;
  final String? name;
  final String hostUserId;
  final RoomStatus status;
  final DateTime createdAt;
  final List<RoomMember> members;
  final List<PlaylistTrack> playlist;

  Room({
    required this.code,
    this.name,
    required this.hostUserId,
    required this.status,
    required this.createdAt,
    this.members = const [],
    this.playlist = const [],
  });

  factory Room.fromJson(Map<String, dynamic> json) {
    return Room(
      code: json['code'],
      name: json['name'],
      hostUserId: json['hostUserId'],
      status: RoomStatus.fromString(json['status']),
      createdAt: DateTime.parse(json['createdAt']),
      members: (json['members'] as List?)
              ?.map((m) => RoomMember.fromJson(m))
              .toList() ??
          [],
      playlist: (json['playlist'] as List?)
              ?.map((t) => PlaylistTrack.fromJson(t))
              .toList() ??
          [],
    );
  }

  bool isHost(String userId) => hostUserId == userId;
}

enum RoomStatus {
  active,
  closed;

  static RoomStatus fromString(String value) {
    return RoomStatus.values.firstWhere(
      (e) => e.name.toUpperCase() == value.toUpperCase(),
      orElse: () => RoomStatus.active,
    );
  }
}

class RoomMember {
  final String userId;
  final String displayName;
  final MemberRole role;
  final DateTime joinedAt;

  RoomMember({
    required this.userId,
    required this.displayName,
    required this.role,
    required this.joinedAt,
  });

  factory RoomMember.fromJson(Map<String, dynamic> json) {
    return RoomMember(
      userId: json['userId'],
      displayName: json['displayName'],
      role: MemberRole.fromString(json['role']),
      joinedAt: DateTime.parse(json['joinedAt']),
    );
  }

  bool get isHost => role == MemberRole.host;
}

enum MemberRole {
  host,
  member;

  static MemberRole fromString(String value) {
    return MemberRole.values.firstWhere(
      (e) => e.name.toUpperCase() == value.toUpperCase(),
      orElse: () => MemberRole.member,
    );
  }
}

class PlaylistTrack {
  final String id;
  final String title;
  final String artist;
  final int durationMs;
  final int orderIndex;
  final String? localFilePath; // Only stored locally, never sent to server

  PlaylistTrack({
    required this.id,
    required this.title,
    required this.artist,
    required this.durationMs,
    required this.orderIndex,
    this.localFilePath,
  });

  factory PlaylistTrack.fromJson(Map<String, dynamic> json) {
    return PlaylistTrack(
      id: json['id'],
      title: json['title'],
      artist: json['artist'] ?? 'Unknown Artist',
      durationMs: json['durationMs'],
      orderIndex: json['orderIndex'],
      // localFilePath is never in server response
    );
  }

  Map<String, dynamic> toMetadataJson() {
    // Only metadata goes to server - NEVER the file path or audio data
    return {
      'clientTrackId': id,
      'title': title,
      'artist': artist,
      'durationMs': durationMs,
    };
  }

  String get formattedDuration {
    final minutes = durationMs ~/ 60000;
    final seconds = (durationMs % 60000) ~/ 1000;
    return '${minutes.toString().padLeft(1, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}
