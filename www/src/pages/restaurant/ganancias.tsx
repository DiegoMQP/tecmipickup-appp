import Head from "next/head";
import RestaurantShell from "../../components/restaurant/RestaurantShell";
import RestaurantAnalytics from "./RestaurantAnalytics";

export default function RestaurantEarningsPage() {
  return (
    <>
      <Head><title>Tecmipickup | Ganancias</title></Head>
      <RestaurantShell activeKey="ganancias"><RestaurantAnalytics mode="earnings" /></RestaurantShell>
    </>
  );
}
