package dev.whatsgood.pocketradar;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** GOGET research is a separate, clearly labeled source; TREND/CHASE remain unchanged. */
public final class GogetActivity extends Activity{
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final TextView[] rows=new TextView[5];
    private TextView status;
    private boolean active=false,loading=false;
    private final Runnable timer=new Runnable(){@Override public void run(){
        if(!active)return;
        fetch();handler.postDelayed(this,60_000);
    }};
    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Color.rgb(10,16,13));
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18),dp(22),dp(18),dp(24));
        scroll.addView(body);setContentView(scroll);
        add(body,"◉ GOGET / WHAT'S GOOD",25,0xFF7CF7A1);
        add(body,"TRUE RESEARCH FEED · NOT TREND / CHASE",12,0xFFBAD6BF);
        status=add(body,"Waiting for GOGET…",13,0xFFBAD6BF);
        Button pair=new Button(this);pair.setText("PAIR / RENEW GOGET READ-ONLY ACCESS");
        pair.setOnClickListener(v->pairPrompt());body.addView(pair);
        Button refresh=new Button(this);refresh.setText("↻ UPDATE GOGET RANKINGS");
        refresh.setOnClickListener(v->fetch());body.addView(refresh);
        Button dashboard=new Button(this);dashboard.setText("OPEN AUTHENTICATED GOGET DASHBOARD");
        dashboard.setOnClickListener(v->startActivity(new Intent(Intent.ACTION_VIEW,
            Uri.parse(RadarRepository.DASHBOARD))));body.addView(dashboard);
        for(int i=0;i<rows.length;i++){
            TextView t=add(body,"—",14,0xFFE2F8E6);
            t.setPadding(dp(9),dp(12),dp(9),dp(12));t.setBackgroundColor(0xFF14261A);
            LinearLayout.LayoutParams p=(LinearLayout.LayoutParams)t.getLayoutParams();
            p.bottomMargin=dp(6);t.setLayoutParams(p);rows[i]=t;
        }
        add(body,"GOGET ranks from a bounded sample of active Solana assets in its D1 research ledger. It may differ from the full dashboard's top five. Only recorded pool and mint identities are used. A transaction count is NOT unique verified buyers. Quote time is the GOGET observation time, not independently confirmed provider quote time. LP lock only appears after a matching independent gate check. Scores are research heuristics, never buy advice.",12,0xFF99B6A1);
        Button clear=new Button(this);clear.setText("CLEAR GOGET DEVICE ACCESS");
        clear.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Remove device pairing?")
            .setMessage("Erases the limited read-only token and cached GOGET research from this phone. Public TREND / CHASE stays intact.")
            .setNegativeButton("Cancel",null)
            .setPositiveButton("Clear",(d,w)->{GogetRepository.clear(getApplicationContext());
                show(GogetRepository.cached(getApplicationContext()));}).show());
        body.addView(clear);
        show(GogetRepository.cached(this));
    }
    private void pairPrompt(){
        EditText field=new EditText(this);
        field.setSingleLine(true);field.setHint("Paste pr1. token from dashboard");
        field.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        LinearLayout box=new LinearLayout(this);box.setPadding(dp(16),0,dp(16),0);
        box.addView(field);
        new AlertDialog.Builder(this).setTitle("Pair with GOGET research")
            .setMessage("In your signed-in GOGET dashboard, open WHAT'S GOOD → PAIR POCKET RADAR and generate a 7-day token. Copy it; paste it here. Do NOT paste your GOGET password.")
            .setView(box).setNegativeButton("Cancel",null)
            .setPositiveButton("Pair",(d,w)->{
                if(GogetRepository.pair(getApplicationContext(),field.getText().toString()))fetch();
                else status.setText("Invalid token shape. Generate a new GOGET device token.");
            }).show();
    }
    @Override protected void onResume(){super.onResume();active=true;handler.post(timer);}
    @Override protected void onPause(){active=false;handler.removeCallbacks(timer);super.onPause();}
    @Override protected void onDestroy(){io.shutdown();super.onDestroy();}
    private void fetch(){
        if(loading)return;loading=true;
        io.execute(()->{
            GogetRepository.Snapshot snapshot=GogetRepository.refresh(getApplicationContext());
            runOnUiThread(()->{loading=false;if(!isFinishing()&&!isDestroyed())show(snapshot);});
        });
    }
    private void show(GogetRepository.Snapshot snap){
        status.setText(snap.status()+"\n"+
            (GogetRepository.paired(this)?"Paired · device-only token · seven-day expiry":
             "Not paired · generate a read-only token in GOGET dashboard"));
        for(int i=0;i<rows.length;i++){
            TextView t=rows[i];
            if(i>=snap.coins.size()){
                t.setText(i==0?(snap.fetchedAt==0?"No authenticated GOGET snapshot":
                    "No qualifying candidates in bounded research sample"):"");
                t.setTextColor(0xFF9AAC9D);t.setOnClickListener(null);continue;
            }
            GogetRepository.Candidate coin=snap.coins.get(i);
            t.setText("#"+(i+1)+" "+coin.line(System.currentTimeMillis()));
            t.setTextColor(0xFFCBFAD6);
            t.setOnClickListener(v->startActivity(
                new Intent(Intent.ACTION_VIEW,Uri.parse(coin.chart))));
        }
    }
    private TextView add(LinearLayout body,String s,int sp,int color){
        TextView t=new TextView(this);t.setText(s);t.setTextSize(sp);
        t.setTextColor(color);t.setPadding(0,dp(5),0,dp(6));body.addView(t);return t;
    }
    private int dp(int v){return (int)(v*getResources().getDisplayMetrics().density+0.5f);}
}
