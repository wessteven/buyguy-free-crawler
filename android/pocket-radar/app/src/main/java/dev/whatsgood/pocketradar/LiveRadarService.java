package dev.whatsgood.pocketradar;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

public final class LiveRadarService extends Service {
    private static final String CHANNEL = "live_radar";
    private static final String PAUSED = "live_paused";
    static final long TICK_MS = 3_000;
    private static LiveRadarService active;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::tick;
    private boolean registered;
    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            main.removeCallbacks(tick);
            if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) main.post(tick);
        }
    };

    static boolean isRunning() {
        return active != null;
    }

    static boolean wasPaused(Context context) {
        return context.getSharedPreferences(CHANNEL, MODE_PRIVATE).getBoolean(PAUSED, false);
    }

    private static void setPaused(Context context, boolean paused) {
        context.getSharedPreferences(CHANNEL, MODE_PRIVATE).edit().putBoolean(PAUSED, paused).apply();
    }

    static void toggle(Context context) {
        Intent service = new Intent(context, LiveRadarService.class);
        if (isRunning()) {
            context.stopService(service);
            return;
        }
        try {
            context.startForegroundService(service);
        } catch (IllegalStateException restricted) {
            setPaused(context, true);
            RadarUpdates.updated(context, true);
        }
    }

    static void refreshNow() {
        if (active != null && active.interactive()) RadarUpdates.request(active, null);
    }

    private boolean interactive() {
        return getSystemService(PowerManager.class).isInteractive();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (active == this) return START_NOT_STICKY;
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(
                CHANNEL, "Live Pocket Radar", NotificationManager.IMPORTANCE_LOW));
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(901, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(901, notification());
            }
        } catch (IllegalStateException restricted) {
            setPaused(this, true);
            RadarUpdates.updated(this, true);
            stopSelf();
            return START_NOT_STICKY;
        }
        active = this;
        setPaused(this, false);
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(screen, filter);
        registered = true;
        RadarUpdates.updated(this, true);
        main.post(tick);
        return START_NOT_STICKY;
    }

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getBroadcast(this, 3,
                new Intent(this, RadarWidget.class).setAction(RadarWidget.STOP_LIVE),
                PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.radar_icon)
                .setContentTitle("WHAT'S GOOD · Live")
                .setContentText("Checks Solana market data while the screen is on")
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Stop", stop).build())
                .build();
    }

    private void tick() {
        if (active != this || !interactive()) return;
        RadarUpdates.request(this, null);
        RadarUpdates.updated(this, false);
        main.postDelayed(tick, TICK_MS);
    }

    @Override public void onTimeout(int startId, int foregroundServiceType) {
        setPaused(this, true);
        stopSelf();
    }

    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (registered) unregisterReceiver(screen);
        if (active == this) {
            active = null;
            RadarUpdates.updated(this, true);
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }
}
