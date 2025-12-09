import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
// import validateUuid from "uuid-validate";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ uuid: string }> }
) {
	try {
		const { uuid } = await params;

		// Validate static UUID format
		// if (!validateUuid(uuid)) {
		// 	return NextResponse.json(
		// 		{ error: "Invalid UUID format" },
		// 		{ status: 400 }
		// 	);
		// }

		// Check if the UUID is the static one from QR code
		const qrCode = await prisma.qRCode.findUnique({
			where: { staticUuid: uuid },
		});

		if (!qrCode) {
			const tempVisitorLink = await prisma.tempVisitorLink.findUnique({
				where: { uuid: uuid },
			});
			if (!tempVisitorLink) {
				return NextResponse.json(
					{ error: "Invalid visitor UUID" },
					{ status: 400 }
				);
			} else {
				return NextResponse.json({ error: "Invalid QR code" }, { status: 404 });
			}
		}

		// Generate a new dynamic UUID for this visitor session
		const dynamicUuid = uuidv4();

		// Calculate expiration time (1 hour from now)
		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + 1);

		// Store the dynamic UUID in the database
		await prisma.tempVisitorLink.create({
			data: {
				uuid: dynamicUuid,
				expiresAt,
				used: false,
			},
		});

		// Redirect to the visitor form with the dynamic UUID
		return NextResponse.json({ dynamicUuid }, { status: 200 });
	} catch (error) {
		console.error("Error validating QR code:", error);
		return NextResponse.json(
			{ error: "Failed to process QR code" },
			{ status: 500 }
		);
	}
}
