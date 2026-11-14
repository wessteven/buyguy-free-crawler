package dev.whatsgood.pocketradar;

import java.net.URI;

final class TokenLogoUrl {
    private TokenLogoUrl() {}

    static String normalized(String value) {
        try {
            URI uri = URI.create(value);
            String host = uri.getHost();
            String path = uri.getRawPath();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null
                    || uri.getPort() != -1 || path == null || value.length() > 512) return null;
            if ("cdn.dexscreener.com".equalsIgnoreCase(host)
                    && path.matches("/cms/images/[A-Za-z0-9_-]{8,128}")) {
                return "https://cdn.dexscreener.com" + path + "?width=64&height=64&quality=90&format=png";
            }
            if ("assets.geckoterminal.com".equalsIgnoreCase(host) && path.matches("/[A-Za-z0-9_-]{8,128}")) {
                return uri.toASCIIString();
            }
            if ("coin-images.coingecko.com".equalsIgnoreCase(host)
                    && path.matches("/coins/images/[0-9]+/(large|small|thumb)/[^/]+")) {
                return uri.toASCIIString();
            }
        } catch (IllegalArgumentException ignored) {
            return null;
        }
        return null;
    }
}
