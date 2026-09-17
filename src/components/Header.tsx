"use client";
import Image from "next/image";
import { UserButton } from "@clerk/nextjs";
import { AlertsDropDown } from "@/features/alerts/components/AlertsDropDown";
import { CurrentSprintHeaderLink } from "@/app/roadmap/_lib/components/CurrentSprintHeaderLink";
import { ProductDropDown } from "@/features/changelog/components/ProductDropDown";
import { EventChatNotificationsDropDown } from "@/features/eventChat/components/EventChatNotificationsDropDown";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";

const Header = () => {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT;
  const { isAdmin, isAccountManager } = usePermissionsStore();
  const showChatNotifications = isAdmin || isAccountManager;

  const getEnvironmentConfig = () => {
    if (environment === "development") {
      return {
        show: true,
        bgColor: "bg-green-700",
        message: "Development - Changes won't affect production data",
      };
    } else if (environment === "staging") {
      return {
        show: true,
        bgColor: "bg-red-700",
        message: "Staging - Changes won't affect production data",
      };
    }
    return { show: false, bgColor: "", message: "" };
  };

  const envConfig = getEnvironmentConfig();

  return (
    <>
      {envConfig.show && (
        <div
          className={`${envConfig.bgColor} text-white text-center py-1 px-4 text-sm font-medium`}
        >
          {envConfig.message}
        </div>
      )}
      <header className="bg-darkBlue text-white py-2 px-2 shadow-md">
        <div className="flex justify-between items-center">
          {/* <p className="text-2xl font-bold ml-6">Bleacher Rentals</p> */}
          <Image
            className="ml-2 h-10 w-auto"
            style={{ height: "auto", width: "auto" }}
            src="/logo.png"
            alt="Bleacher Rentals Logo"
            width={120}
            height={40}
            priority
          />
          <div className="flex items-center mr-2 relative">
            <div className="flex items-center  mr-4">
              <CurrentSprintHeaderLink />
              <ProductDropDown />
            </div>
            {showChatNotifications && (
              <div className="mr-3">
                <EventChatNotificationsDropDown />
              </div>
            )}
            <div className="mr-3">
              <AlertsDropDown />
            </div>
            <UserButton />
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
