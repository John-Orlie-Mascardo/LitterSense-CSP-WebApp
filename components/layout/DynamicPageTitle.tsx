"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const APP_NAME = "LitterSense";

const routeTitles: Record<string, string> = {
  "/": "Login",
  "/login": "Login",
  "/signup": "Sign Up",
  "/forgot-password": "Forgot Password",
  "/forgot-password/check-email": "Check Email",
  "/dashboard": "Dashboard",
  "/dashboard/cats": "My Cats",
  "/dashboard/notifications": "Notifications",
  "/dashboard/playback": "Playback",
  "/dashboard/reports": "Reports",
  "/dashboard/settings": "Settings",
  "/admin": "Admin",
};

function getPageTitle(pathname: string) {
  if (routeTitles[pathname]) {
    return routeTitles[pathname];
  }

  if (pathname.startsWith("/dashboard/cats/")) {
    return "Cat Details";
  }

  return "Dashboard";
}

export function DynamicPageTitle() {
  const pathname = usePathname();

  useEffect(() => {
    document.title = `${APP_NAME} | ${getPageTitle(pathname)}`;
  }, [pathname]);

  return null;
}
