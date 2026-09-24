import { describe, it, expect, vi, beforeEach } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoginForm, AutoLoginKey, type LoginActionState } from "#/components/auth/login-form";

function noopAction(): Promise<LoginActionState> {
  return Promise.resolve({ error: null });
}

describe("LoginForm auto-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("checks the box by default and auto-submits once per session", () => {
    const action = vi.fn(noopAction);
    render(<LoginForm action={action} />);

    expect(screen.getByRole("checkbox", { name: /automatically next time/i })).toBeChecked();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("respects an opt-out stored preference and does not auto-submit", () => {
    localStorage.setItem(AutoLoginKey, "false");
    const action = vi.fn(noopAction);
    render(<LoginForm action={action} />);

    expect(screen.getByRole("checkbox", { name: /automatically next time/i })).not.toBeChecked();
    expect(action).not.toHaveBeenCalled();
  });

  it("persists the checkbox choice on submit", () => {
    localStorage.setItem(AutoLoginKey, "false");
    sessionStorage.setItem("lumi.autologin.attempted", "1");
    const action = vi.fn(noopAction);
    render(<LoginForm action={action} />);
    expect(action).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: /automatically next time/i }));
    const button = screen.getByRole("button", { name: /continue with discord/i });
    fireEvent.submit(button.closest("form") as HTMLFormElement);
    expect(localStorage.getItem(AutoLoginKey)).toBe("true");
  });
});
