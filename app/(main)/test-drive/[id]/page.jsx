import { getCarById } from "@/actions/car-listing";
import { notFound } from "next/navigation";
import { TestDriveForm } from "./_components/test-drive-form";

export async function generateMetadata() {
  return {
    title: `Book Test Drive | Vehiql`,
    description: `Schedule a test drive in few seconds`,
  };
}

export default async function TestDrivePage({ params }) {
  // params may be a Promise in the new Next APIs — unwrap it first
  const resolvedParams = await params;
  const id = resolvedParams?.id;

  // Validate id before calling the DB
  if (!id || typeof id !== "string") {
    console.error("TestDrivePage: missing or invalid id route param:", id);
    return notFound();
  }

  let result;
  try {
    result = await getCarById(id);
  } catch (err) {
    console.error("Error fetching car by id:", err);
    return notFound();
  }

  // Expecting your getCarById to return { success, data } (as your code assumed)
  if (!result?.success || !result?.data) {
    console.warn("Car not found or getCarById returned failure for id:", id);
    return notFound();
  }

  const car = result.data;

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-6xl mb-6 gradient-title">Book a Test Drive</h1>
      <TestDriveForm car={car} testDriveInfo={car.testDriveInfo} />
    </div>
  );
}
