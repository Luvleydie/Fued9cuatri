package com.novacart.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class MetadataFrameAssemblerTest {
    private byte[] begin(int size) {
        return new byte[]{1, (byte) size, (byte) (size >>> 8), (byte) (size >>> 16), (byte) (size >>> 24)};
    }

    @Test
    public void preservesUtf8AcrossChunkBoundariesAndOnlyReturnsOnCommit() {
        MetadataFrameAssembler assembler = new MetadataFrameAssembler();
        byte[] expected = "{\"name\":\"recibo-☕-á.pdf\"}".getBytes(StandardCharsets.UTF_8);
        assertNull(assembler.accept("phone", begin(expected.length), 0));
        for (int i = 0; i < expected.length; i++) {
            assertNull(assembler.accept("phone", new byte[]{2, expected[i]}, i + 1));
        }
        assertArrayEquals(expected, assembler.accept("phone", new byte[]{3}, 100));
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{3}, 101));
    }

    @Test
    public void rejectsInterleavedSenderWithoutCorruptingTheOwner() {
        MetadataFrameAssembler assembler = new MetadataFrameAssembler();
        assembler.accept("first", begin(1), 0);
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("second", begin(1), 1));
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("second", new byte[]{2, 9}, 2));
        assembler.accept("first", new byte[]{2, 7}, 3);
        assertArrayEquals(new byte[]{7}, assembler.accept("first", new byte[]{3}, 4));
    }

    @Test
    public void rejectsIncompleteAndOversizedWritesAndClearsTheTransfer() {
        MetadataFrameAssembler assembler = new MetadataFrameAssembler();
        assembler.accept("phone", begin(2), 0);
        assembler.accept("phone", new byte[]{2, 7}, 1);
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{3}, 2));
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{2, 7}, 3));
        assembler.accept("phone", begin(1), 4);
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{2, 7, 8}, 5));
        assembler.accept("phone", begin(32), 6);
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[21], 7));
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{3}, 8));
    }

    @Test
    public void boundsAnnouncedLengthBeforeAllocating() {
        MetadataFrameAssembler assembler = new MetadataFrameAssembler();
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", begin(0), 0));
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", begin(16_385), 0));
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", begin(-1), 0));
        assertNull(assembler.accept("phone", begin(16_384), 0));
    }

    @Test
    public void expiresPartialTransfersAndReleasesTheOwner() {
        MetadataFrameAssembler assembler = new MetadataFrameAssembler();
        assembler.accept("phone", begin(1), 0);
        assembler.accept("phone", new byte[]{2, 7}, 20_000);
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("other", begin(1), 49_999));
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{3}, 50_000));
        assertNull(assembler.accept("other", begin(1), 50_001));
    }

    @Test
    public void disconnectAndStopDiscardPartialData() {
        MetadataFrameAssembler assembler = new MetadataFrameAssembler();
        assembler.accept("phone", begin(1), 0);
        assembler.disconnect("other");
        assembler.accept("phone", new byte[]{2, 7}, 1);
        assembler.disconnect("phone");
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{3}, 2));
        assembler.accept("other", begin(1), 3);
        assembler.clear();
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("other", new byte[]{2, 7}, 4));
    }

    @Test
    public void rejectsUnexpectedFramesAndDuplicateBegin() {
        MetadataFrameAssembler assembler = new MetadataFrameAssembler();
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{2, 7}, 0));
        assembler.accept("phone", begin(1), 1);
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", begin(1), 2));
        assembler.accept("phone", begin(1), 3);
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{9}, 4));
        assertThrows(IllegalArgumentException.class, () -> assembler.accept("phone", new byte[]{1, 1}, 5));
    }
}
