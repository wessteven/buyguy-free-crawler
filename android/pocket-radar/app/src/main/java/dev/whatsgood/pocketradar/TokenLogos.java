package dev.whatsgood.pocketradar;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.util.LruCache;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class TokenLogos {
    private static final int ICON_PX = 48;
    private static final int MAX_DOWNLOAD = 256 * 1024;
    private static final long RETRY_MS = 5 * 60_000;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ExecutorService IO = Executors.newFixedThreadPool(3);
    private static final LruCache<String, Bitmap> ICONS = new LruCache<>(96);
    private static final LruCache<String, Long> RETRY = new LruCache<>(96);
    private static final Set<String> PENDING = new HashSet<>();
    private static final Set<Runnable> LISTENERS = new HashSet<>();
    private static boolean repaintQueued;

    private TokenLogos() {}

    static void observe(Runnable listener) {
        LISTENERS.add(listener);
    }

    static void removeObserver(Runnable listener) {
        LISTENERS.remove(listener);
    }

    static Bitmap get(Context context, RadarRepository.Coin coin) {
        String mint = coin.mint();
        String url = TokenLogoUrl.normalized(coin.logo);
        if (url == null || !mint.matches("[1-9A-HJ-NP-Za-km-z]{32,44}")) return null;
        String key = mint + "-" + UUID.nameUUIDFromBytes(url.getBytes(StandardCharsets.UTF_8));
        Bitmap bitmap = ICONS.get(key);
        if (bitmap != null) return bitmap;
        Long retryAt = RETRY.get(key);
        if ((retryAt != null && retryAt > SystemClock.elapsedRealtime()) || !PENDING.add(key)) return null;

        Context app = context.getApplicationContext();
        IO.execute(() -> {
            Bitmap loaded = load(app, key, url);
            MAIN.post(() -> {
                PENDING.remove(key);
                if (loaded == null) {
                    RETRY.put(key, SystemClock.elapsedRealtime() + RETRY_MS);
                    return;
                }
                ICONS.put(key, loaded);
                if (!repaintQueued) {
                    repaintQueued = true;
                    MAIN.postDelayed(() -> {
                        repaintQueued = false;
                        RadarWidget.renderAll(app);
                        for (Runnable listener : LISTENERS) listener.run();
                    }, 120);
                }
            });
        });
        return null;
    }

    private static Bitmap load(Context context, String key, String url) {
        File directory = new File(context.getCacheDir(), "token-logos");
        AtomicFile file = new AtomicFile(new File(directory, key + ".png"));
        Bitmap cached = BitmapFactory.decodeFile(file.getBaseFile().getPath());
        if (cached != null) return cached;

        try {
            Bitmap bitmap = download(url);
            if (bitmap == null) return null;
            try {
                FileOutputStream out = file.startWrite();
                try {
                    if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new IOException("Logo encoding failed");
                    file.finishWrite(out);
                } catch (IOException failed) {
                    file.failWrite(out);
                }
            } catch (IOException ignored) {
                // A disk-cache failure still leaves a usable logo in memory.
            }
            pruneDiskCache(directory);
            return bitmap;
        } catch (IOException | RuntimeException unavailable) {
            return null;
        }
    }

    private static synchronized void pruneDiskCache(File directory) {
        File[] entries = directory.listFiles((dir, name) -> name.endsWith(".png"));
        if (entries == null || entries.length <= 128) return;
        java.util.Arrays.sort(entries, java.util.Comparator.comparingLong(File::lastModified));
        for (int i = 0; i < entries.length - 128; i++) entries[i].delete();
    }

    private static Bitmap download(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "image/*");
        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            byte[] bytes;
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                for (int count; (count = input.read(buffer)) != -1; ) {
                    if (out.size() + count > MAX_DOWNLOAD) return null;
                    out.write(buffer, 0, count);
                }
                bytes = out.toByteArray();
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            int edge = Math.max(options.outWidth, options.outHeight);
            if (options.outWidth <= 0 || options.outHeight <= 0 || edge > 2048) return null;
            options.inJustDecodeBounds = false;
            options.inSampleSize = Math.max(1, Integer.highestOneBit(edge / ICON_PX));
            Bitmap image = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (image == null) return null;
            float scale = Math.min(1f, (float) ICON_PX / Math.max(image.getWidth(), image.getHeight()));
            return Bitmap.createScaledBitmap(image, Math.max(1, Math.round(image.getWidth() * scale)),
                    Math.max(1, Math.round(image.getHeight() * scale)), true);
        } finally {
            connection.disconnect();
        }
    }
}
