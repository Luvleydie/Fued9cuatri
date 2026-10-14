package com.novacart.app;

/** Bounded, single-sender BLE framing. Contains metadata JSON only, never file bytes. */
final class MetadataFrameAssembler {
    static final int MAX_BYTES = 16_384;
    static final long IDLE_TIMEOUT_MS = 30_000;
    private String owner;
    private byte[] buffer;
    private int position;
    private long lastFrameAt;

    byte[] accept(String deviceId, byte[] frame, long now) {
        expire(now);
        try {
            if (deviceId == null || frame == null || frame.length == 0 || frame.length > 20) {
                throw new IllegalArgumentException("Trama inválida");
            }
            if (owner != null && !owner.equals(deviceId)) {
                throw new IllegalArgumentException("Hay otra transferencia en curso");
            }
            int kind = frame[0] & 0xff;
            if (kind == 1) {
                if (buffer != null || frame.length != 5) {
                    throw new IllegalArgumentException("Inicio inválido");
                }
                long length = (frame[1] & 0xffL) | ((frame[2] & 0xffL) << 8)
                    | ((frame[3] & 0xffL) << 16) | ((frame[4] & 0xffL) << 24);
                if (length < 1 || length > MAX_BYTES) {
                    throw new IllegalArgumentException("Metadata demasiado grande");
                }
                owner = deviceId;
                buffer = new byte[(int) length];
                position = 0;
                lastFrameAt = now;
                return null;
            }
            if (buffer == null) {
                throw new IllegalArgumentException("Falta el inicio de transferencia");
            }
            if (kind == 2) {
                int count = frame.length - 1;
                if (count < 1 || position + count > buffer.length) {
                    throw new IllegalArgumentException("Longitud de metadata inválida");
                }
                System.arraycopy(frame, 1, buffer, position, count);
                position += count;
                lastFrameAt = now;
                return null;
            }
            if (kind == 3 && frame.length == 1 && position == buffer.length) {
                byte[] complete = buffer;
                clear();
                return complete;
            }
            throw new IllegalArgumentException("Transferencia incompleta o trama inválida");
        } catch (IllegalArgumentException error) {
            disconnect(deviceId);
            throw error;
        }
    }

    void expire(long now) {
        if (buffer != null && now - lastFrameAt >= IDLE_TIMEOUT_MS) clear();
    }

    void disconnect(String deviceId) {
        if (owner != null && owner.equals(deviceId)) clear();
    }

    void clear() {
        owner = null;
        buffer = null;
        position = 0;
        lastFrameAt = 0;
    }
}
