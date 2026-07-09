class AuthToken {
  final String token;
  final String userId;
  final String roomCode;
  final String displayName;
  final bool isHost;

  AuthToken({
    required this.token,
    required this.userId,
    required this.roomCode,
    required this.displayName,
    required this.isHost,
  });

  factory AuthToken.fromResponse(Map<String, dynamic> json) {
    return AuthToken(
      token: json['token'],
      userId: json['userId'],
      roomCode: json['roomCode'],
      displayName: json['displayName'],
      isHost: json['role'] == 'HOST',
    );
  }
}
