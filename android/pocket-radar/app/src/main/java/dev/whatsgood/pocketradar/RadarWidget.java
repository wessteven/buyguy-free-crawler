package dev.whatsgood.pocketradar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

public final class RadarWidget extends AppWidgetProvider {
    private static final String ACTION_MODE = "dev.whatsgood.pocketradar.MODE";
    private static final String ACTION_REFRESH = "dev.whatsgood.pocketradar.REFRESH";
    private static final String TOGGLE_LIVE = "dev.whatsgood.pocketradar.TOGGLE_LIVE";
    static final String STOP_LIVE = "dev.whatsgood.pocketradar.STOP_LIVE";

    private static final int[] ROWS = {R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4};
    private static final int[] LOGOS = {R.id.logo0, R.id.logo1, R.id.logo2, R.id.logo3, R.id.logo4};
    private static final int[] SYMBOLS = {R.id.symbol0, R.id.symbol1, R.id.symbol2, R.id.symbol3, R.id.symbol4};
    private static final int[] PRICES = {R.id.price0, R.id.price1, R.id.price2, R.id.price3, R.id.price4};
    private static final int[] DETAILS = {R.id.details0, R.id.details1, R.id.details2, R.id.details3, R.id.details4};

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        renderAll(context);
        RadarRefreshJob.enqueue(context, false);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        renderAll(context);
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
        for (int id : ids) {
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
            views.setTextViewText(R.id.empty, emptyMessage(snapshot));

            int height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            int visible = Math.min(height >= 220 ? 5 : 3, snapshot.coins.size());
            for (int i = 0; i < ROWS.length; i++) {
                views.setViewVisibility(ROWS[i], i < visible ? View.VISIBLE : View.GONE);
                if (i >= visible) continue;
                RadarRepository.Coin coin = snapshot.coins.get(i);
                Bitmap logo = TokenLogos.get(context, coin);
                if (logo == null) views.setImageViewResource(LOGOS[i], R.drawable.token_placeholder);
                else views.setImageViewBitmap(LOGOS[i], logo);
                views.setTextViewText(SYMBOLS[i], coin.name);
                views.setTextViewText(PRICES[i], RadarRepository.formatPrice(coin.usd) + "  "
                        + RadarRepository.formatMove(coin.m5) + "/" + RadarRepository.formatMove(coin.h1));
                views.setTextColor(PRICES[i], coin.m5 >= 0 ? 0xFF90FFB6 : 0xFFFFA99D);
                views.setTextViewText(DETAILS[i], coin.widgetDetails(snapshot.mode));
                Intent chart = new Intent(Intent.ACTION_VIEW, Uri.parse(coin.url));
                views.setOnClickPendingIntent(ROWS[i], PendingIntent.getActivity(context, 100 + i, chart,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            }
            manager.updateAppWidget(id, views);
        }
    }

    private static PendingIntent control(Context context, int code, String action) {
        Intent intent = new Intent(context, RadarWidget.class).setAction(action)
                .addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_IMMUTABLE);
    }
}
