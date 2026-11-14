package dev.whatsgood.pocketradar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

public final class RadarWidget extends AppWidgetProvider {
    private static final String ACTION_MODE = "dev.whatsgood.pocketradar.MODE";
    private static final String ACTION_REFRESH = "dev.whatsgood.pocketradar.REFRESH";
    private static final String TOGGLE_LIVE = "dev.whatsgood.pocketradar.TOGGLE_LIVE";
    static final String STOP_LIVE = "dev.whatsgood.pocketradar.STOP_LIVE";

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        renderAll(context);
        RadarRefreshJob.enqueue(context, false);
    }

    @Override public void onReceive(Context context, Intent intent) {
        switch (intent.getAction() == null ? "" : intent.getAction()) {
            case ACTION_MODE:
                RadarRepository.toggleMode(context);
                RadarUpdates.updated(context, true);
                break;
            case ACTION_REFRESH:
                RadarRefreshJob.enqueue(context, true);
                break;
            case TOGGLE_LIVE:
                LiveRadarService.toggle(context);
                break;
            case STOP_LIVE:
                context.stopService(new Intent(context, LiveRadarService.class));
                break;
            default:
                super.onReceive(context, intent);
        }
    }

    static String status(Context context, RadarRepository.Snapshot snapshot) {
        String prefix = LiveRadarService.isRunning() ? "POLL · "
                : LiveRadarService.wasPaused(context) ? "LIVE PAUSED · " : "";
        return prefix + snapshot.status() + (RadarUpdates.checking() ? " · ↻" : "");
    }

    static String emptyMessage(RadarRepository.Snapshot snapshot) {
        if (snapshot.fetchedAt == 0) return snapshot.error == null
                ? "Waiting for Solana market data" : "Feed unavailable · tap ↻";
        return RadarRepository.CHASE.equals(snapshot.mode)
                ? "No CHASE matches · tap TREND" : "No qualifying trending pools";
    }

    static void renderStatus(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, RadarWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.radar_widget);
        setStatus(context, views, RadarRepository.cached(context));
        manager.partiallyUpdateAppWidget(ids, views);
    }

    private static void setStatus(Context context, RemoteViews views, RadarRepository.Snapshot snapshot) {
        views.setTextViewText(R.id.status, status(context, snapshot));
        views.setTextColor(R.id.status, snapshot.stale() || LiveRadarService.wasPaused(context)
                ? 0xFFE9BD76 : 0xFF9FBEAB);
    }

    static void renderAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, RadarWidget.class));
        if (ids.length == 0) return;
        RadarRepository.Snapshot snapshot = RadarRepository.cached(context);
        boolean live = LiveRadarService.isRunning();
        PendingIntent home = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.radar_widget);
        setStatus(context, views, snapshot);
        views.setOnClickPendingIntent(R.id.header, home);
        views.setTextViewText(R.id.mode, snapshot.mode);
        views.setContentDescription(R.id.mode, snapshot.mode + " mode. Switch mode.");
        views.setOnClickPendingIntent(R.id.mode, control(context, 0, ACTION_MODE));
        views.setTextViewText(R.id.live, live ? "STOP" : "LIVE");
        views.setContentDescription(R.id.live, live ? "Stop live updates" : "Start live updates");
        views.setOnClickPendingIntent(R.id.live, control(context, 1, TOGGLE_LIVE));
        views.setOnClickPendingIntent(R.id.refresh, control(context, 2, ACTION_REFRESH));
        views.setOnClickPendingIntent(R.id.empty, home);
        views.setViewVisibility(R.id.empty, snapshot.coins.isEmpty() ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.tokens, snapshot.coins.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.empty, emptyMessage(snapshot));

        for (RadarRepository.Coin coin : snapshot.coins) TokenLogos.get(context, coin);
        views.setRemoteAdapter(R.id.tokens, new Intent(context, RadarRows.class));
        Intent chart = new Intent(context, MainActivity.class).setAction(MainActivity.ACTION_OPEN_POOL);
        views.setPendingIntentTemplate(R.id.tokens, PendingIntent.getActivity(context, 3, chart,
                PendingIntent.FLAG_MUTABLE));
        manager.updateAppWidget(ids, views);
        manager.notifyAppWidgetViewDataChanged(ids, R.id.tokens);
    }

    private static PendingIntent control(Context context, int code, String action) {
        Intent intent = new Intent(context, RadarWidget.class).setAction(action)
                .addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_IMMUTABLE);
    }
}
