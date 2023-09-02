const channeltransformer = {
    computeChannelNumber: function(channel) {
        // Put Pluto in 10k range
        return 10000 + channel.number;
    },
    transformPlaylistUrl: function(m3uUrl, channel) {
        const channelUrl = `https://pluto.tv/en/live-tv/${channel.slug}`;
        return `pipe:///usr/bin/env streamlink --stdout --default-stream best --retry-streams 10 --retry-max 10 --retry-open 10 --stream-segment-attempts 10 --url ${channelUrl}`;
    }
};

module.exports = channeltransformer;