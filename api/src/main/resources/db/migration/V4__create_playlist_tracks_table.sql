-- V4: Create playlist tracks table (metadata only — NO file storage)
CREATE TABLE playlist_tracks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID         NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    client_track_id VARCHAR(255) NOT NULL,
    title           VARCHAR(500) NOT NULL,
    artist          VARCHAR(500),
    duration_ms     BIGINT       NOT NULL,
    order_index     INTEGER      NOT NULL,
    added_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(room_id, client_track_id)
);

CREATE INDEX idx_tracks_room ON playlist_tracks(room_id);
CREATE INDEX idx_tracks_order ON playlist_tracks(room_id, order_index);
