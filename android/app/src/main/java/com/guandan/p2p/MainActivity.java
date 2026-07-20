package com.guandan.p2p;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom plugins BEFORE super.onCreate() so the bridge picks them up.
        registerPlugin(WsServerPlugin.class);
        super.onCreate(savedInstanceState);

        // ★ v0.4.26 BUG-03:允许 WebView 无用户手势自动播放媒体(BGM)。
        //   Android WebView 默认 MediaPlaybackRequiresUserGesture = true,导致
        //   打开 App 时 audio.startBgm() 的 <audio>.play() 被静默拒绝,音乐不响。
        //   关掉这个开关后,进 App 即可自动播放背景音乐(用户仍可在设置里关 BGM)。
        try {
            WebView webView = this.bridge.getWebView();
            if (webView != null) {
                webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception e) {
            // 忽略:拿不到 WebView 时退回首次交互解锁(main.js 已注册 pointerdown)
        }
    }
}
