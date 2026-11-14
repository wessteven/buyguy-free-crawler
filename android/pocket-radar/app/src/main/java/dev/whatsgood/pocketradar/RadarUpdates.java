package dev.whatsgood.pocketradar;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Shares one market request across the app, widget job and live service. */
final class RadarUpdates {
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Set<Runnable> OBSERVERS = new LinkedHashSet<>();
    private static final Set<Runnable> COMPLETIONS = new LinkedHashSet<>();
    private static long nextCheck;
    private static boolean checking;

    private RadarUpdates() {}

    static boolean checking() {
        return checking;
    }

    static boolean request(Context context, Runnable complete) {
        if (checking) {
            if (complete != null) COMPLETIONS.add(complete);
            return true;
        }
        long now = SystemClock.elapsedRealtime();
        if (now < nextCheck) return false;
        nextCheck = now + RadarRepository.LIVE_CHECK_MS;
        checking = true;
        if (complete != null) COMPLETIONS.add(complete);
        Context app = context.getApplicationContext();
        updated(app, false);
        IO.execute(() -> {
            try {
                RadarRepository.refresh(app);
            } finally {
                MAIN.post(() -> {
                    checking = false;
                    for (Runnable callback : new ArrayList<>(COMPLETIONS)) callback.run();
                    COMPLETIONS.clear();
                    updated(app, true);
                });
            }
        });
        return true;
    }

    static void observe(Runnable observer) {
        OBSERVERS.add(observer);
    }

    static void remove(Runnable observer) {
        OBSERVERS.remove(observer);
    }

    static void cancelCompletion(Runnable complete) {
        COMPLETIONS.remove(complete);
    }

    static void updated(Context context, boolean rows) {
        if (rows) RadarWidget.renderAll(context);
        else RadarWidget.renderStatus(context);
        for (Runnable observer : new ArrayList<>(OBSERVERS)) observer.run();
    }
}
