from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
OUT_DIR = Path("/tmp/xo-royale-smoke")


def play_round(host, guest):
    host.get_by_label("Cell 1").click()
    guest.get_by_label("Cell 4").click()
    host.get_by_label("Cell 2").click()
    guest.get_by_label("Cell 5").click()
    host.get_by_label("Cell 3").click()


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        host_context = browser.new_context(viewport={"width": 1440, "height": 980})
        guest_context = browser.new_context(viewport={"width": 1280, "height": 860})

        host = host_context.new_page()
        guest = guest_context.new_page()

        host.goto(BASE_URL)
        host.wait_for_load_state("networkidle")
        host.get_by_label("Name").fill("Host Ace")
        host.get_by_role("button", name="3").click()
        host.get_by_role("button", name="Create room").click()
        room_code = host.locator(".room-code strong").inner_text(timeout=5000)
        expect(host.get_by_text("Waiting for guest")).to_be_visible()

        guest.goto(f"{BASE_URL}/?room={room_code}")
        guest.wait_for_load_state("networkidle")
        guest.get_by_label("Name").fill("Guest Nine")
        guest.get_by_role("button", name="Join room").click()
        expect(guest.locator(".room-code strong")).to_have_text(room_code)
        expect(guest.locator(".player-tile.mark-o strong")).to_have_text("Guest Nine")
        expect(host.get_by_text("Start match")).to_be_visible()

        host.get_by_role("button", name="Start match").click()
        expect(host.get_by_text("Host Ace to move")).to_be_visible()

        play_round(host, guest)
        expect(host.get_by_text("Host Ace wins round 1")).to_be_visible()
        expect(host.get_by_text("1 - 0")).to_be_visible()
        host.screenshot(path=str(OUT_DIR / "desktop-round-win.png"), full_page=True)

        mobile = browser.new_page(viewport={"width": 390, "height": 860})
        mobile.goto(BASE_URL)
        mobile.wait_for_load_state("networkidle")
        expect(mobile.get_by_role("button", name="Create room")).to_be_visible()
        mobile.screenshot(path=str(OUT_DIR / "mobile-home.png"), full_page=True)

        browser.close()

    print(f"room={room_code}")
    print(f"screenshots={OUT_DIR}")


if __name__ == "__main__":
    main()
