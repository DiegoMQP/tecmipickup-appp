import Head from "next/head";
import RestaurantShell from "../../components/restaurant/RestaurantShell";
import Kanban6 from "./kanban-6";

export default function RestaurantPedidosPage() {
  return (
    <>
      <Head>
        <title>Tecmipickup | Pedidos</title>
      </Head>
      <RestaurantShell activeKey="pedidos"><Kanban6 /></RestaurantShell>
    </>
  );
}
