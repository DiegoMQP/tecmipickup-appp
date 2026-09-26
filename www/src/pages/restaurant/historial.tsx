import Head from "next/head";
import RestaurantShell from "../../components/restaurant/RestaurantShell";
import RestaurantAnalytics from "./RestaurantAnalytics";

export default function RestaurantHistoryPage() {
  return (
    <>
      <Head><title>Tecmipickup | Historial de pedidos</title></Head>
      <RestaurantShell activeKey="historial"><RestaurantAnalytics mode="history" /></RestaurantShell>
    </>
  );
}
