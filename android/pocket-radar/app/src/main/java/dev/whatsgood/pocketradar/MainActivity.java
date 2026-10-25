package dev.whatsgood.pocketradar;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final TextView[] rows=new TextView[5];
    private TextView status;
    private boolean active=false,loading=false;
    private final Runnable timer=new Runnable(){@Override public void run(){
        if(!active)return;
        fetch();
        handler.postDelayed(this,30_000);
    }};
    @Override protected void onCreate(Bundle b){
        super.onCreate(b);
        ScrollView scroll=new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(10,16,13));
        LinearLayout body=new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18),dp(24),dp(18),dp(24));
        scroll.addView(body);setContentView(scroll);
        add(body,"◉ WHAT'S GOOD",27,0xFF7CF7A1,true);
        add(body,"POCKET RADAR · SOLANA",12,0xFFB0CBB7,false);
        status=add(body,"Fetching public market data…",13,0xFFB0CBB7,false);
        Button refresh=new Button(this);refresh.setText("↻ REFRESH NOW");
        refresh.setOnClickListener(v->fetch());body.addView(refresh);
        for(int i=0;i<rows.length;i++){
            rows[i]=add(body,"—",16,0xFFECFFF1,true);
            rows[i].setPadding(dp(8),dp(14),dp(8),dp(14));
            rows[i].setBackgroundColor(0xFF14261A);
            LinearLayout.LayoutParams lp=(LinearLayout.LayoutParams)rows[i].getLayoutParams();
            lp.bottomMargin=dp(5);rows[i].setLayoutParams(lp);
        }
        Button dashboard=new Button(this);dashboard.setText("OPEN GOGET / WHAT'S GOOD");
        dashboard.setOnClickListener(v->startActivity(new Intent(Intent.ACTION_VIEW,
            Uri.parse(RadarRepository.DASHBOARD))));body.addView(dashboard);
        add(body,"GeckoTerminal trending pools first; fallback is DexScreener boost listings (paid promotion, NOT independent discovery). Filters use reported USD liquidity ≥ $50k, not verified exit liquidity. Tap a row for its exact pool. No trading permissions.",13,0xFFABB8AC,false);
        add(body,"Foreground app checks every 30s, provider requests at most once/min. Widget refresh on tap or Android-managed periodic intervals. A displayed fetch age is NOT proof the underlying quote is equally fresh.",12,0xFF829B88,false);
        show(RadarRepository.cached(this));
    }
    @Override protected void onResume(){super.onResume();active=true;handler.post(timer);}
    @Override protected void onPause(){active=false;handler.removeCallbacks(timer);super.onPause();}
    @Override protected void onDestroy(){io.shutdown();super.onDestroy();}
    private void fetch(){
        if(loading)return;
        loading=true;
        io.execute(()->{
            RadarRepository.Snapshot snap=RadarRepository.refresh(getApplicationContext());
            runOnUiThread(()->{
                loading=false;
                if(!isFinishing()&&!isDestroyed())show(snap);
            });
            RadarWidget.renderAll(getApplicationContext(),snap);
        });
    }
    private void show(RadarRepository.Snapshot snap){
        status.setText(snap.status()+"\n"+snap.details());
        for(int i=0;i<rows.length;i++){
            TextView row=rows[i];
            if(i>=snap.coins.size()){
                row.setText(i==0?(snap.error!=null?"Feed unavailable: "+snap.details():"No pools currently meet $50k minimum"):"");
                row.setTextColor(0xFF92AA98);
                row.setOnClickListener(null);
                continue;
            }
            RadarRepository.Coin coin=snap.coins.get(i);
            row.setText(coin.line());
            row.setTextColor(coin.m5>=0?0xFF7CF7A1:0xFFFFA99D);
            row.setOnClickListener(v->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(coin.url))));
        }
    }
    private TextView add(LinearLayout layout,String text,int sp,int color,boolean bold){
        TextView t=new TextView(this);t.setText(text);t.setTextSize(sp);t.setTextColor(color);
        t.setPadding(0,dp(6),0,dp(6));
        if(bold)t.setTypeface(null,android.graphics.Typeface.BOLD);
        layout.addView(t);return t;
    }
    private int dp(int n){return(int)(n*getResources().getDisplayMetrics().density+0.5f);}
}
