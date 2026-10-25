package dev.whatsgood.pocketradar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class RadarWidget extends AppWidgetProvider {
    private static final String ACTION_REFRESH="dev.whatsgood.pocketradar.REFRESH";
    private static final int[] ROWS={R.id.row0,R.id.row1,R.id.row2,R.id.row3,R.id.row4};
    private static final ExecutorService IO=Executors.newSingleThreadExecutor();
    @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){
        PendingResult pending=goAsync();
        Context app=context.getApplicationContext();
        IO.execute(()->{
            try{
                renderAll(app,RadarRepository.cached(app));
                renderAll(app,RadarRepository.refresh(app));
            }finally{pending.finish();}
        });
    }
    @Override public void onReceive(Context context,Intent intent){
        super.onReceive(context,intent);
        if(ACTION_REFRESH.equals(intent.getAction())){
            PendingResult pending=goAsync();
            Context app=context.getApplicationContext();
            IO.execute(()->{try{renderAll(app,RadarRepository.refresh(app));}finally{pending.finish();}});
        }
    }
    @Override public void onAppWidgetOptionsChanged(Context context,AppWidgetManager manager,int widgetId,Bundle options){
        super.onAppWidgetOptionsChanged(context,manager,widgetId,options);
        renderAll(context.getApplicationContext(),RadarRepository.cached(context.getApplicationContext()));
    }
    static void renderAll(Context c,RadarRepository.Snapshot snapshot){
        AppWidgetManager manager=AppWidgetManager.getInstance(c);
        int[] ids=manager.getAppWidgetIds(new ComponentName(c,RadarWidget.class));
        for(int id:ids){
            RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.radar_widget);
            Bundle options=manager.getAppWidgetOptions(id);
            int height=options==null?0:options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,0);
            int visible=height>=235?5:3;
            v.setTextViewText(R.id.status,snapshot.status());
            v.setTextViewText(R.id.footer,"DEX".equals(snapshot.source)?
                "5m/1h moves · BOOSTED ads · not GOGET":"5m/1h moves · MC ≠ FDV · not GOGET");
            Intent refresh=new Intent(c,RadarWidget.class).setAction(ACTION_REFRESH);
            refresh.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
            v.setOnClickPendingIntent(R.id.refresh,PendingIntent.getBroadcast(c,0,refresh,
                PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT));
            PendingIntent home=PendingIntent.getActivity(c,1,new Intent(c,MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
            v.setOnClickPendingIntent(R.id.header,home);
            for(int i=0;i<ROWS.length;i++){
                v.setViewVisibility(ROWS[i],i<visible?View.VISIBLE:View.GONE);
                if(i>=snapshot.coins.size()){
                    v.setTextViewText(ROWS[i],i==0?(snapshot.error!=null?"Feed problem: "+snapshot.details():"No qualifying market pools"):"");
                    v.setTextColor(ROWS[i],Color.rgb(166,180,168));
                    v.setOnClickPendingIntent(ROWS[i],home);
                    continue;
                }
                RadarRepository.Coin coin=snapshot.coins.get(i);
                v.setTextViewText(ROWS[i],coin.widgetLine());
                v.setTextColor(ROWS[i],coin.m5>=0?0xFF7CF7A1:0xFFFFA99D);
                Intent view=new Intent(Intent.ACTION_VIEW,Uri.parse(coin.url));
                v.setOnClickPendingIntent(ROWS[i],PendingIntent.getActivity(c,100+i,view,
                    PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT));
            }
            manager.updateAppWidget(id,v);
        }
    }
}
