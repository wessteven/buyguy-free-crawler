package dev.whatsgood.pocketradar;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Public Solana pool price display. No trading, wallet, API keys or private GOGET session. */
final class RadarRepository {
    static final String DASHBOARD="https://buyguy-free-radar.wessteven.workers.dev/dashboard";
    private static final String FEED="https://api.geckoterminal.com/api/v2/networks/solana/trending_pools";
    private static final String PREFS="pocket-radar-v02";
    // Public API quotes are cached roughly 60 seconds upstream; don't promise tick-level prices.
    private static final long FETCH_FLOOR_MS=60_000L, STALE_MS=5*60_000L;
    private static final double RESERVE_FLOOR=50_000;
    static final class Coin {
        final String name,price,change,url;
        final double m5,reserve;
        Coin(String name,String price,String change,double m5,double reserve,String url) {
            this.name=name;this.price=price;this.change=change;this.m5=m5;this.reserve=reserve;this.url=url;
        }
        String line(){return name+"  "+price+"  "+change+"  · R "+compact(reserve);}
    }
    static final class Snapshot {
        final List<Coin> coins; final long fetchedAt;final String error;
        Snapshot(List<Coin> c,long at,String e){coins=c;fetchedAt=at;error=e;}
        String status(){
            String age=fetchedAt>0?(Math.max(0,System.currentTimeMillis()-fetchedAt)/1000)+"s ago":"never";
            boolean stale=fetchedAt==0||System.currentTimeMillis()-fetchedAt>STALE_MS;
            return (error!=null?"FEED ERROR • ":"")+(stale?"STALE ":"UPDATED ")+age+" • 5m change";
        }
    }
    static Snapshot cached(Context c) {
        SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        ArrayList<Coin> out=new ArrayList<>();
        try {
            JSONArray data=new JSONArray(p.getString("rows","[]"));
            for(int i=0;i<Math.min(5,data.length());i++){
                JSONObject j=data.getJSONObject(i);
                out.add(new Coin(j.getString("name"),j.getString("price"),j.getString("change"),
                    j.getDouble("m5"),j.getDouble("reserve"),j.getString("url")));
            }
        }catch(Exception ignored){out.clear();}
        return new Snapshot(out,p.getLong("at",0),p.getString("error",null));
    }
    static synchronized Snapshot refresh(Context c){
        SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        long now=System.currentTimeMillis();
        if(now-p.getLong("attempt",0)<FETCH_FLOOR_MS)return cached(c);
        p.edit().putLong("attempt",now).apply();
        HttpURLConnection connection=null;
        try {
            connection=(HttpURLConnection)new URL(FEED).openConnection();
            connection.setConnectTimeout(4500);connection.setReadTimeout(4500);
            connection.setRequestProperty("Accept","application/json;version=20230203");
            if(connection.getResponseCode()!=200)throw new IllegalStateException("HTTP "+connection.getResponseCode());
            ByteArrayOutputStream buffer=new ByteArrayOutputStream();
            try(InputStream stream=connection.getInputStream()){
                byte[] bytes=new byte[4096];int n;
                while((n=stream.read(bytes))!=-1){
                    buffer.write(bytes,0,n);
                    if(buffer.size()>1_000_000)throw new IllegalStateException("Response too large");
                }
            }
            List<Coin> coins=parse(new JSONObject(buffer.toString(StandardCharsets.UTF_8.name())));
            JSONArray json=new JSONArray();
            for(Coin coin:coins){
                JSONObject row=new JSONObject();
                row.put("name",coin.name);row.put("price",coin.price);row.put("change",coin.change);
                row.put("m5",coin.m5);row.put("reserve",coin.reserve);row.put("url",coin.url);
                json.put(row);
            }
            long fetched=System.currentTimeMillis();
            p.edit().putString("rows",json.toString()).putLong("at",fetched).remove("error").apply();
            return new Snapshot(coins,fetched,null);
        }catch(Exception ex){
            p.edit().putString("error",ex.getClass().getSimpleName()).apply();
            return cached(c);
        }finally{if(connection!=null)connection.disconnect();}
    }
    static List<Coin> parse(JSONObject json){
        ArrayList<Coin> result=new ArrayList<>();
        JSONArray data=json.optJSONArray("data");
        if(data==null)return result;
        for(int i=0;i<data.length()&&result.size()<5;i++){
            JSONObject pool=data.optJSONObject(i);
            if(pool==null)continue;
            JSONObject attr=pool.optJSONObject("attributes");
            if(attr==null)continue;
            String address=attr.optString("address","");
            if(!address.matches("[1-9A-HJ-NP-Za-km-z]{32,64}"))continue;
            double reserve=number(attr.opt("reserve_in_usd"));
            double usd=number(attr.opt("base_token_price_usd"));
            JSONObject changes=attr.optJSONObject("price_change_percentage");
            double m5=changes==null?Double.NaN:number(changes.opt("m5"));
            if(!Double.isFinite(reserve)||reserve<RESERVE_FLOOR||!Double.isFinite(usd)||usd<=0||!Double.isFinite(m5))continue;
            String name=attr.optString("name","Unknown").split(" / ")[0].trim();
            if(name.length()>16)name=name.substring(0,16);
            if(name.isEmpty())name="Unknown";
            String price=usd>=1?String.format(Locale.US,"$%.3f",usd)
                :usd>=0.01?String.format(Locale.US,"$%.4f",usd)
                :usd>=0.0001?String.format(Locale.US,"$%.6f",usd)
                :String.format(Locale.US,"$%.9f",usd);
            result.add(new Coin(name,price,String.format(Locale.US,"%+.1f%%",m5),m5,reserve,
                "https://www.geckoterminal.com/solana/pools/"+address));
        }
        return result;
    }
    private static double number(Object v){
        try{return Double.parseDouble(String.valueOf(v));}catch(Exception e){return Double.NaN;}
    }
    private static String compact(double n){
        return n>=1_000_000?String.format(Locale.US,"$%.1fm",n/1_000_000)
            :n>=1000?String.format(Locale.US,"$%.0fk",n/1000):String.format(Locale.US,"$%.0f",n);
    }
    private RadarRepository(){}
}
