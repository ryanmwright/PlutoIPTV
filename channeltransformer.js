const channeltransformer = {
    computeChannelNumber: function(channel) {
        // Put Pluto in 10k range
        return 10000 + channel.number;
    },
    transformPlaylistUrl: function(m3uUrl, channel) {
        const channelUrl = `https://pluto.tv/en/live-tv/${channel.slug}`;
        return `pipe:///usr/bin/env pluto-stream ${channelUrl}`;
    }
};

module.exports = channeltransformer;