import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Updated import path
import { createHash } from "crypto";
import prisma from "@/lib/prisma"; // Import shared prisma instance

// Function to generate a hash of queue data to detect changes
function generateQueueHash(queues: Record<string, unknown>[]): string {
	// Create a string representation of the queues
	const queueString = JSON.stringify(queues);
	// Generate SHA-256 hash
	return createHash("sha256").update(queueString).digest("hex");
}

export async function GET(req: NextRequest) {
	try {
		// Get the current session to verify authentication
		const session = await getServerSession(authOptions);
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get client hash from URL parameters
		const url = new URL(req.url);
		const clientHash = url.searchParams.get("hash") || "";

		// Get today's date (start of day)
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);
		const endOfToday = new Date(startOfToday);
		endOfToday.setDate(endOfToday.getDate() + 1);
		// Get all queues for today, without filtering by status
		const queues = await prisma.queue.findMany({
			where: {
				createdAt: {
					gte: startOfToday,
					lt: endOfToday,
				},
			},
			include: {
				visitor: {
					select: {
						name: true,
						phone: true,
						institution: true,
					},
				},
				service: {
					select: {
						name: true,
					},
				},
				admin: {
					select: {
						name: true,
					},
				},
			},
			orderBy: {
				queueNumber: "asc",
			},
		});

		// Generate a hash of the current data
		const serverHash = generateQueueHash(queues);

		// Check if the data has changed
		const hasChanges = !clientHash || clientHash !== serverHash;

		return NextResponse.json({
			queues,
			hash: serverHash,
			hasChanges,
		});
	} catch (error) {
		console.error("Error fetching all queues:", error);
		return NextResponse.json(
			{ error: "Failed to fetch queues" },
			{ status: 500 }
		);
	}
}
