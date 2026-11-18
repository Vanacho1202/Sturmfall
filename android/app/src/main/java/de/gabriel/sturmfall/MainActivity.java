package de.gabriel.sturmfall;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

// Die App lädt das Spiel live vom Server – jedes Update auf Render ist sofort in der App.
public class MainActivity extends Activity {
    static final String URL = "https://sturmfall.onrender.com/?app=1";
    WebView web;
    LinearLayout overlay;
    TextView status;
    Button retry;
    boolean loaded = false;
    long start;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) w.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 18, 34));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 18, 34));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));

        overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.CENTER);
        overlay.setBackgroundColor(Color.rgb(11, 18, 34));
        TextView title = new TextView(this);
        title.setText("STURMFALL");
        title.setTextColor(Color.rgb(255, 216, 58));
        title.setTextSize(44);
        title.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD_ITALIC));
        overlay.addView(title);
        ProgressBar pb = new ProgressBar(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.topMargin = 30;
        overlay.addView(pb, lp);
        status = new TextView(this);
        status.setTextColor(Color.argb(200, 255, 255, 255));
        status.setTextSize(15);
        status.setGravity(Gravity.CENTER);
        status.setPadding(40, 30, 40, 10);
        status.setText("Verbinde mit dem Server …");
        overlay.addView(status);
        retry = new Button(this);
        retry.setText("Nochmal versuchen");
        retry.setVisibility(View.GONE);
        retry.setOnClickListener(v -> load());
        overlay.addView(retry);
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " SturmfallApp/1");
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("sturmfall.onrender.com".equals(u.getHost())) return false;
                try { startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;
            }
            @Override
            public void onPageFinished(WebView v, String url) {
                if (url != null && url.startsWith("https://sturmfall.onrender.com") && !failed) {
                    loaded = true;
                    overlay.animate().alpha(0f).setDuration(350).withEndAction(() -> overlay.setVisibility(View.GONE)).start();
                }
            }
            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) fail("Keine Verbindung. Bist du online?");
            }
        });
        load();
        // Hinweis, wenn der kostenlose Server erst aufwachen muss
        root.postDelayed(new Runnable() { public void run() {
            if (!loaded && !failed) { status.setText("Der Server wird geweckt … das dauert beim ersten Start bis zu einer Minute."); }
        } }, 6000);
    }

    boolean failed = false;
    void load() {
        failed = false; loaded = false;
        overlay.setAlpha(1f); overlay.setVisibility(View.VISIBLE);
        retry.setVisibility(View.GONE);
        status.setText("Verbinde mit dem Server …");
        start = System.currentTimeMillis();
        web.loadUrl(URL);
    }
    void fail(String msg) {
        failed = true;
        overlay.setAlpha(1f); overlay.setVisibility(View.VISIBLE);
        status.setText(msg);
        retry.setVisibility(View.VISIBLE);
    }

    void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }
    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); web.resumeTimers(); immersive(); }
    @Override protected void onPause() { web.onPause(); web.pauseTimers(); super.onPause(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }

    @Override
    public void onBackPressed() {
        // Zurück-Taste: im Spiel zuerst Karte/Einstellungen schließen, sonst fragen
        web.evaluateJavascript("(window.__appBack && window.__appBack()) ? 1 : 0", v -> {
            if ("1".equals(v)) return;
            new AlertDialog.Builder(this).setTitle("Sturmfall beenden?").setPositiveButton("Beenden", (d, i) -> finish()).setNegativeButton("Weiterspielen", null).show();
        });
    }
}
