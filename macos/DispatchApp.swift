import AppKit
import WebKit

final class DispatchApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private let dispatchURL = URL(string: "https://dispatch.gachauffeurs.co.uk/")!
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "GA Dispatch"
        window.minSize = NSSize(width: 520, height: 420)
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window

        let mainMenu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit GA Dispatch", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        for (title, action, key) in [
            ("Cut", "cut:", "x"), ("Copy", "copy:", "c"),
            ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")
        ] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)
        NSApplication.shared.mainMenu = mainMenu

        webView.load(URLRequest(url: dispatchURL))
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == "https", url.host == dispatchURL.host {
            if action.targetFrame == nil {
                webView.load(action.request)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
            return
        }
        if action.navigationType == .linkActivated && ["https", "mailto", "tel"].contains(url.scheme ?? "") {
            let workspace = NSWorkspace.shared
            if url.host == "www.google.com", url.path.hasPrefix("/maps"),
               let chrome = workspace.urlForApplication(withBundleIdentifier: "com.google.Chrome") {
                workspace.open([url], withApplicationAt: chrome, configuration: NSWorkspace.OpenConfiguration(), completionHandler: nil)
            } else {
                workspace.open(url)
            }
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let window else { completionHandler(); return }
        let alert = NSAlert()
        alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let window else { completionHandler(false); return }
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }
}

let application = NSApplication.shared
let delegate = DispatchApp()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
