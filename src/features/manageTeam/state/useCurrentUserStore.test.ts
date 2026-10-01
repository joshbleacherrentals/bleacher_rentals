import { beforeEach, describe, expect, it } from "vitest";
import { useCurrentUserStore } from "./useCurrentUserStore";

beforeEach(() => {
  useCurrentUserStore.getState().resetForm();
});

describe("accountant role tab", () => {
  it("adding it sets the flag and opens the tab", () => {
    useCurrentUserStore.getState().addRoleTab("accountant");

    const state = useCurrentUserStore.getState();
    expect(state.isAccountant).toBe(true);
    expect(state.roleTabs).toEqual(["accountant"]);
  });

  it("adding it twice does not duplicate the tab", () => {
    useCurrentUserStore.getState().addRoleTab("accountant");
    useCurrentUserStore.getState().addRoleTab("accountant");

    expect(useCurrentUserStore.getState().roleTabs).toEqual(["accountant"]);
  });

  it("removing it clears the flag and the tab", () => {
    useCurrentUserStore.getState().addRoleTab("accountant");
    useCurrentUserStore.getState().removeRoleTab("accountant");

    const state = useCurrentUserStore.getState();
    expect(state.isAccountant).toBe(false);
    expect(state.roleTabs).toEqual([]);
  });

  it("does not touch any other role's flag", () => {
    useCurrentUserStore.getState().addRoleTab("accountant");

    const state = useCurrentUserStore.getState();
    expect(state.isAdmin).toBe(false);
    expect(state.isViewer).toBe(false);
    expect(state.isDriver).toBe(false);
    expect(state.isAccountManager).toBe(false);
    expect(state.isDeveloper).toBe(false);
    expect(state.isMaintainer).toBe(false);
  });

  it("adding another role leaves the accountant flag alone", () => {
    useCurrentUserStore.getState().addRoleTab("accountant");
    useCurrentUserStore.getState().addRoleTab("viewer");
    useCurrentUserStore.getState().removeRoleTab("viewer");

    expect(useCurrentUserStore.getState().isAccountant).toBe(true);
  });

  it("starts a new user without it", () => {
    expect(useCurrentUserStore.getState().isAccountant).toBe(false);
  });
});
