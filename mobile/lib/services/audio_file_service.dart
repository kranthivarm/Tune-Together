import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:audiotagger/audiotagger.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/room.dart';
import 'package:uuid/uuid.dart';

class AudioFileService {
  final _tagger = Audiotagger();
  final _uuid = const Uuid();

  /// Request storage permission (Android/iOS)
  Future<bool> requestStoragePermission() async {
    if (Platform.isAndroid) {
      // Android 13+ uses different permissions
      if (await _isAndroid13OrHigher()) {
        final status = await Permission.audio.request();
        return status.isGranted;
      } else {
        final status = await Permission.storage.request();
        return status.isGranted;
      }
    } else if (Platform.isIOS) {
      final status = await Permission.mediaLibrary.request();
      return status.isGranted;
    }
    return true; // Desktop platforms don't need permission
  }

  Future<bool> _isAndroid13OrHigher() async {
    if (!Platform.isAndroid) return false;
    // Android 13 = API level 33
    // This is a simplified check; in production you'd use platform channels
    return true; // Assume modern Android for this implementation
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
        final metadata = await _extractMetadata(file.path!);
        audioFiles.add(metadata);
      } catch (e) {
        print('Error reading metadata for ${file.path}: $e');
        // Create a basic entry with filename
        audioFiles.add(LocalAudioFile(
          id: _uuid.v4(),
          path: file.path!,
          title: file.name,
          artist: 'Unknown Artist',
          durationMs: 0, // Unknown duration
        ));
      }
    }

    return audioFiles;
  }

  /// Extract metadata from audio file using ID3 tags
  Future<LocalAudioFile> _extractMetadata(String filePath) async {
    final tag = await _tagger.readTags(path: filePath);

    // Get duration (this may require additional platform-specific code)
    final durationMs = await _getAudioDuration(filePath);

    return LocalAudioFile(
      id: _uuid.v4(),
      path: filePath,
      title: tag?.title ?? _getFileNameWithoutExtension(filePath),
      artist: tag?.artist ?? 'Unknown Artist',
      album: tag?.album,
      durationMs: durationMs,
    );
  }

  /// Get audio duration in milliseconds
  /// Note: This is a placeholder. In production, you'd use just_audio or similar
  /// to accurately determine duration.
  Future<int> _getAudioDuration(String filePath) async {
    // Simplified: return 0 for now
    // In production, use just_audio to load and get duration:
    // final player = AudioPlayer();
    // await player.setFilePath(filePath);
    // final duration = player.duration;
    // return duration?.inMilliseconds ?? 0;
    return 0;
  }

  String _getFileNameWithoutExtension(String path) {
    final fileName = path.split('/').last;
    return fileName.split('.').first;
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
}

class LocalAudioFile {
  final String id; // Client-generated UUID
  final String path; // Local file path - NEVER sent to server
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
