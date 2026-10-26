package dev.whatsgood.pocketradar;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * User-triggered read-only network diagnosis.
 * Resolves three public hostnames through the phone's configured resolver;
 * never queries wallet data or bypasses Private DNS / VPN policies.
 */
final class ConnectionDoctor {
    private static final String[] HOSTS={
        "example.com",
        "api.geckoterminal.com",
        "api.dexscreener.com",
        "buyguy-free-radar.wessteven.workers.dev"
    };
    static String diagnose(Context context){
        StringBuilder out=new StringBuilder();
        out.append("Pocket Radar v0.4 network self-test\n");
        out.append("INTERNET permission: ")
            .append(context.checkSelfPermission(Manifest.permission.INTERNET)==PackageManager.PERMISSION_GRANTED?"granted":"MISSING")
            .append("\n");
        out.append("ACCESS_NETWORK_STATE: ")
            .append(context.checkSelfPermission(Manifest.permission.ACCESS_NETWORK_STATE)==PackageManager.PERMISSION_GRANTED?"granted":"MISSING")
            .append("\n");
        try {
            ConnectivityManager cm=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network net=cm==null?null:cm.getActiveNetwork();
            NetworkCapabilities caps=net==null||cm==null?null:cm.getNetworkCapabilities(net);
            out.append("Active network: ").append(networkType(caps)).append("\n");
        } catch(SecurityException e){out.append("Active network: permission denied\n");}
          catch(RuntimeException e){out.append("Active network: unavailable\n");}
        for(String host:HOSTS){
            out.append(host).append(": ");
            try {
                InetAddress[] addresses=InetAddress.getAllByName(host);
                out.append(addresses.length>0?"DNS OK":"no DNS answers");
            } catch(UnknownHostException e){
                out.append("DNS FAILED");
            } catch(SecurityException e){
                out.append("permission denied");
            } catch(RuntimeException e){
                out.append("resolver error (").append(e.getClass().getSimpleName()).append(")");
            }
            out.append("\n");
        }
        out.append("\nIf example.com also fails, check connection/Private DNS. ");
        out.append("If example.com works but market hosts fail, check DNS filtering or VPN. ");
        out.append("If browser works but app fails, check per-app network settings.");
        return out.toString();
    }
    static String networkType(NetworkCapabilities caps){
        if(caps==null)return "not detected";
        String type=caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)?"VPN":
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)?"Wi-Fi":
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)?"mobile data":
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)?"Ethernet":"other";
        String state=caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)?"validated":
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)?"not validated":"no internet capability";
        return type+" ("+state+")";
    }
    private ConnectionDoctor(){}
}
