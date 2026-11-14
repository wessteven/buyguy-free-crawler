package dev.whatsgood.pocketradar;

import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

public final class RadarRows extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new RemoteViewsFactory() {
            private volatile RadarRepository.Snapshot snapshot;

            @Override public void onCreate() {
                onDataSetChanged();
            }

            @Override public void onDataSetChanged() {
                snapshot = RadarRepository.cached(RadarRows.this);
            }

            @Override public RemoteViews getViewAt(int position) {
                RadarRepository.Snapshot current = snapshot;
                if (position < 0 || position >= current.coins.size()) return null;
                RadarRepository.Coin coin = current.coins.get(position);
                RemoteViews row = new RemoteViews(getPackageName(), R.layout.radar_token_row);
                Bitmap logo = TokenLogos.cached(coin);
                if (logo == null) row.setImageViewResource(R.id.token_logo, R.drawable.token_placeholder);
                else row.setImageViewBitmap(R.id.token_logo, logo);
                row.setTextViewText(R.id.token_symbol, coin.name);
                row.setTextViewText(R.id.token_price, RadarRepository.formatPrice(coin.usd) + "  "
                        + RadarRepository.formatMove(coin.m5) + "/" + RadarRepository.formatMove(coin.h1));
                row.setTextColor(R.id.token_price, coin.m5 >= 0 ? 0xFF90FFB6 : 0xFFFFA99D);
                row.setTextViewText(R.id.token_details, coin.widgetDetails(current.mode));
                row.setOnClickFillInIntent(R.id.token_row,
                        new Intent().putExtra(MainActivity.EXTRA_POOL_URL, coin.url));
                return row;
            }

            @Override public int getCount() { return snapshot.coins.size(); }
            @Override public RemoteViews getLoadingView() { return null; }
            @Override public int getViewTypeCount() { return 1; }
            @Override public long getItemId(int position) { return position; }
            @Override public boolean hasStableIds() { return false; }
            @Override public void onDestroy() {}
        };
    }
}
