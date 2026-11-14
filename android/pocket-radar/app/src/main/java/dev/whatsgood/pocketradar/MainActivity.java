package dev.whatsgood.pocketradar;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int GREEN = 0xFF90FFB6;
    private static final int MUTED = 0xFF9FBEAB;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final LinearLayout[] rows = new LinearLayout[5];
    private final ImageView[] logos = new ImageView[5];
    private final TextView[] values = new TextView[5];
    private final TextView[] details = new TextView[5];
    private final Runnable repaint = this::show;
    private final Runnable timer = new Runnable() {
        @Override public void run() {
            if (!LiveRadarService.isRunning()) {
                RadarUpdates.request(MainActivity.this, null);
                showStatus();
            }
            handler.postDelayed(this, LiveRadarService.TICK_MS);
        }
    };
    private TextView status;
    private TextView diagnostic;
    private TextView empty;
    private Button mode;
    private Button live;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(0xFF0B1511);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18), dp(28), dp(18), dp(24));
        scroll.addView(body);
        setContentView(scroll);

        add(body, "> WHAT'S GOOD", 25, GREEN, true);
        add(body, "POCKET RADAR / SOLANA", 12, MUTED, false);
        status = add(body, "", 12, MUTED, false);
        LinearLayout controls = new LinearLayout(this);
        body.addView(controls);
        mode = button(controls, "TREND", () -> {
            RadarRepository.toggleMode(this);
            RadarUpdates.updated(this, true);
        });
        live = button(controls, "LIVE", () -> LiveRadarService.toggle(this));
        button(controls, "↻", () -> RadarUpdates.request(this, null))
                .setContentDescription("Refresh radar");

        empty = add(body, "", 12, MUTED, false);
        for (int i = 0; i < rows.length; i++) {
            LinearLayout row = new LinearLayout(this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setMinimumHeight(dp(54));
            row.setPadding(dp(10), dp(5), dp(10), dp(5));
            row.setBackgroundResource(R.drawable.widget_bg);
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2);
            rowParams.setMargins(0, 0, 0, dp(5));
            body.addView(row, rowParams);
            ImageView logo = new ImageView(this);
            logo.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
            LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(24), dp(24));
            logoParams.setMarginEnd(dp(9));
            row.addView(logo, logoParams);
            LinearLayout text = new LinearLayout(this);
            text.setOrientation(LinearLayout.VERTICAL);
            row.addView(text, new LinearLayout.LayoutParams(0, -2, 1));
            values[i] = add(text, "", 13, GREEN, true);
            details[i] = add(text, "", 11, MUTED, false);
            rows[i] = row;
            logos[i] = logo;
        }

        button(body, "OPEN GOGET / WHAT'S GOOD", () -> open(RadarRepository.DASHBOARD));
        button(body, "GOGET RESEARCH · OUR SCORE", () -> startActivity(new Intent(this, GogetActivity.class)));
        Button doctor = button(body, "TEST INTERNET / DNS", () -> {});
        TextView report = add(body, "", 11, MUTED, false);
        report.setVisibility(View.GONE);
        doctor.setOnClickListener(v -> {
            doctor.setEnabled(false);
            report.setVisibility(View.VISIBLE);
            report.setText("Checking network and DNS…");
            io.execute(() -> {
                String result = ConnectionDoctor.diagnose(getApplicationContext());
                runOnUiThread(() -> {
                    if (!isFinishing() && !isDestroyed()) {
                        report.setText(result);
                        doctor.setEnabled(true);
                    }
                });
            });
        });
        button(body, "TEST GECKO URL IN BROWSER", () ->
                open("https://api.geckoterminal.com/api/v2/networks/solana/trending_pools"));
        diagnostic = add(body, "", 11, MUTED, false);
        add(body, "LIVE checks the market about every 30s and updates the check age every 3s "
                + "while the screen is on. CHECK is the time since the last successful provider read.",
                11, MUTED, false);
        show();
    }

    @Override protected void onResume() {
        super.onResume();
        RadarUpdates.observe(repaint);
        TokenLogos.observe(repaint);
        show();
        handler.post(timer);
    }

    @Override protected void onPause() {
        handler.removeCallbacks(timer);
        RadarUpdates.remove(repaint);
        TokenLogos.removeObserver(repaint);
        super.onPause();
    }

    @Override protected void onDestroy() {
        io.shutdown();
        super.onDestroy();
    }

    private void showStatus() {
        showStatus(RadarRepository.cached(this));
    }

    private void showStatus(RadarRepository.Snapshot snapshot) {
        status.setText(RadarWidget.status(this, snapshot));
        status.setTextColor(snapshot.stale() || LiveRadarService.wasPaused(this) ? 0xFFE9BD76 : MUTED);
    }

    private void show() {
        RadarRepository.Snapshot snapshot = RadarRepository.cached(this);
        showStatus(snapshot);
        diagnostic.setText(snapshot.details());
        mode.setText(snapshot.mode);
        live.setText(LiveRadarService.isRunning() ? "STOP LIVE" : "START LIVE");
        empty.setVisibility(snapshot.coins.isEmpty() ? View.VISIBLE : View.GONE);
        empty.setText(RadarWidget.emptyMessage(snapshot));
        for (int i = 0; i < rows.length; i++) {
            boolean visible = i < snapshot.coins.size();
            rows[i].setVisibility(visible ? View.VISIBLE : View.GONE);
            if (!visible) continue;
            RadarRepository.Coin coin = snapshot.coins.get(i);
            values[i].setText(coin.name + "  " + RadarRepository.formatPrice(coin.usd)
                    + "  5m " + RadarRepository.formatMove(coin.m5) + "  1h " + RadarRepository.formatMove(coin.h1));
            values[i].setTextColor(coin.m5 >= 0 ? GREEN : 0xFFFFA99D);
            details[i].setText(coin.widgetDetails(snapshot.mode));
            Bitmap logo = TokenLogos.get(this, coin);
            if (logo == null) logos[i].setImageResource(R.drawable.token_placeholder);
            else logos[i].setImageBitmap(logo);
            rows[i].setOnClickListener(v -> open(coin.url));
        }
    }

    private void open(String url) {
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    }

    private Button button(LinearLayout layout, String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setTypeface(Typeface.MONOSPACE);
        button.setTextColor(GREEN);
        button.setTextSize(12);
        button.setOnClickListener(v -> action.run());
        layout.addView(button);
        return button;
    }

    private TextView add(LinearLayout layout, String text, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.MONOSPACE, bold ? Typeface.BOLD : Typeface.NORMAL);
        view.setPadding(0, dp(2), 0, dp(2));
        layout.addView(view);
        return view;
    }

    private int dp(int size) {
        return Math.round(size * getResources().getDisplayMetrics().density);
    }
}
