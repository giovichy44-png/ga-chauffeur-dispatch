import AppKit
import WebKit
import UserNotifications

final class DispatchApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
    private let dispatchURL = URL(string: "https://dispatch.gachauffeurs.co.uk/")!
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "dispatchAlerts")
        UNUserNotificationCenter.current().delegate = self

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
        let notificationsItem = appMenu.addItem(withTitle: "Enable Mac Notifications",
            action: #selector(enableNotifications), keyEquivalent: "")
        notificationsItem.target = self
        appMenu.addItem(.separator())
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

    @objc private func enableNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard !granted else { return }
            DispatchQueue.main.async {
                let alert = NSAlert()
                alert.messageText = "Allow GA Dispatch notifications in System Settings"
                alert.informativeText = "Open Notifications, then choose GA Dispatch."
                if let window = self.window { alert.beginSheetModal(for: window) }
            }
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.name == "dispatchAlerts", message.frameInfo.isMainFrame,
              origin.protocol == "https", origin.host == dispatchURL.host,
              let body = message.body as? [String: Bool] else { return }

        let alerts = [
            ("booking", "Booking update", "Open GA Dispatch to review the booking."),
            ("chauffeur", "New chauffeur message", "Open GA Dispatch to read the message."),
            ("customer", "New customer message", "Open GA Dispatch to read the message."),
            ("urgent", "Urgent allocation required", "Open GA Dispatch to allocate a chauffeur.")
        ]
        let center = UNUserNotificationCenter.current()
        for (key, title, detail) in alerts {
            let identifier = "dispatch-" + key
            guard body[key] == true else {
                if body[key] == false { center.removeDeliveredNotifications(withIdentifiers: [identifier]) }
                continue
            }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = detail
            content.sound = .default
            center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil))
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            NSApplication.shared.activate(ignoringOtherApps: true)
            self.window?.makeKeyAndOrderFront(nil)
            completionHandler()
        }
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
