package dev.whatsgood.pocketradar;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Narrow, auditable short-term momentum screen over the provider's current
 * trending sample. NOT OUR SCORE, verified buyers, token safety or buy advice.
 */
final class ChaseRanker {
    private static final long MAX_POOL_AGE_MS=72L*60*60*1000;

    static boolean qualifies(RadarRepository.Coin coin,long now){
        if(coin.createdAt<=0||coin.createdAt>now||now-coin.createdAt>MAX_POOL_AGE_MS)return false;
        if(coin.buys5<10||coin.sells5<0)return false;
        if(coin.buys5<1.3*Math.max(1,coin.sells5))return false;
        if(!Double.isFinite(coin.m5)||coin.m5<2||coin.m5>30)return false;
        if(Double.isFinite(coin.h1)&&(coin.h1<0||coin.h1>80))return false;
        return RadarRepository.eligible(coin.reserve,coin.usd,coin.m5);
    }

    static List<RadarRepository.Coin> rank(List<RadarRepository.Coin> sample,long now){
        ArrayList<RadarRepository.Coin> out=new ArrayList<>();
        for(RadarRepository.Coin coin:sample)if(qualifies(coin,now))out.add(coin);
        out.sort(Comparator
            .comparingInt((RadarRepository.Coin c)->c.buys5-c.sells5).reversed()
            .thenComparingLong(c->now-c.createdAt)
            .thenComparing((RadarRepository.Coin c)->-c.reserve));
        return out;
    }

    private ChaseRanker(){}
}
