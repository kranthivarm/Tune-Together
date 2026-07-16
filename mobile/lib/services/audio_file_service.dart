import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:just_audio/just_audio.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/room.dart';
import 'package:uuid/uuid.dart';

class AudioFileService {
  final _uuid = const Uuid();
  AudioPlayer? _metadataPlayer;

  /// Request storage permission (Android/iOS)
  Future<bool> requestStoragePermission() async {
    if (Platform.isAndroid) {
      // Android 13+ uses READ_MEDIA_AUDIO
      final status = await Permission.audio.request();
      if (status.isGranted) return true;
      // Fallback for older Android
      final storageStatus = await Permission.storage.request();
      return storageStatus.isGranted;
    } else if (Platform.isIOS) {
      // iOS uses media library permission
      final status = await Permission.mediaLibrary.request();
      return status.isGranted;
    }
    return true; // Desktop platforms don't need permission
  }

  /// Pick audio files from device storage
  Future<List<LocalAudioFile>> pickAudioFiles() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.audio,
      allowMultiple: true,
    );

    if (result == null || result.files.isEmpty) {
      return [];
    }

    final audioFiles = <LocalAudioFile>[];

    for (final file in result.files) {
      if (file.path == null) continue;

      try {
        final metadata = await _extractMetadata(file.path!, file.name);
        audioFiles.add(metadata);
      } catch (e) {
        print('Error reading metadata for ${file.path}: $e');
        // Create a basic entry with filename
        audioFiles.add(LocalAudioFile(
          id: _uuid.v4(),
          path: file.path!,
          title: _getFileNameWithoutExtension(file.name),
          artist: 'Unknown Artist',
          durationMs: 0,
        ));
      }
    }

    return audioFiles;
  }

  /// Extract metadata and duration from audio file
  Future<LocalAudioFile> _extractMetadata(String filePath, String fileName) async {
    // Use just_audio to get accurate duration
    final durationMs = await _getAudioDuration(filePath);

    // Parse title/artist from filename ("Artist - Title.mp3" pattern)
    final baseName = _getFileNameWithoutExtension(fileName);
    String title = baseName;
    String artist = 'Unknown Artist';

    final dashIndex = baseName.indexOf(' - ');
    if (dashIndex > 0) {
      artist = baseName.substring(0, dashIndex).trim();
      title = baseName.substring(dashIndex + 3).trim();
    }

    return LocalAudioFile(
      id: _uuid.v4(),
      path: filePath,
      title: title,
      artist: artist,
      durationMs: durationMs,
    );
  }

  /// Get audio duration in milliseconds using just_audio
  Future<int> _getAudioDuration(String filePath) async {
    try {
      _metadataPlayer ??= AudioPlayer();
      final duration = await _metadataPlayer!.setFilePath(filePath);
      return duration?.inMilliseconds ?? 0;
    } catch (e) {
      print('Error getting duration for $filePath: $e');
      return 0;
    }
  }

  String _getFileNameWithoutExtension(String name) {
    final lastDot = name.lastIndexOf('.');
    if (lastDot > 0) return name.substring(0, lastDot);
    return name;
  }

  /// Convert LocalAudioFile to PlaylistTrack (for UI display)
  PlaylistTrack toPlaylistTrack(LocalAudioFile file, int orderIndex) {
    return PlaylistTrack(
      id: file.id,
      title: file.title,
      artist: file.artist,
      durationMs: file.durationMs,
      orderIndex: orderIndex,
      localFilePath: file.path,
    );
  }

  /// Clean up resources
  void dispose() {
    _metadataPlayer?.dispose();
    _metadataPlayer = null;
  }
}

class LocalAudioFile {
  final String id; // Client-generated UUID
  final String path; // Local file path — NEVER sent to server
  final String title;
  final String artist;
  final String? album;
  final int durationMs;

  LocalAudioFile({
    required this.id,
    required this.path,
    required this.title,
    required this.artist,
    this.album,
    required this.durationMs,
  });
}
