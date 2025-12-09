import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

// Function to generate a hash based on queue data
function generateQueueHash(queueData: Record<string, unknown>): string {
	const queueString = JSON.stringify(queueData);
	return createHash("sha256").update(queueString).digest("hex");
}

export async function GET(req: NextRequest) {
	try {
		// Get the UUID from the header
		const visitorUuid = req.headers.get("x-visitor-uuid");
		const clientHash = req.headers.get("x-queue-hash") || "";

		if (!visitorUuid) {
			return NextResponse.json(
				{ error: "Missing visitor UUID" },
				{ status: 400 }
			);
		}

		// Check if the temp visitor link exists
		const tempVisitorLink = await prisma.tempVisitorLink.findUnique({
			where: { uuid: visitorUuid },
		});

		if (!tempVisitorLink) {
			return NextResponse.json(
				{ error: "Invalid visitor UUID" },
				{ status: 400 }
			);
		}

		// Find the queue using the temp UUID
		const queue = await prisma.queue.findFirst({
			where: { tempUuid: visitorUuid },
			include: {
				service: {
					select: {
						name: true,
					},
				},
				visitor: {
					select: {
						name: true,
						phone: true,
					},
				},
			},
		});

		if (!queue) {
			// The link is valid but not yet used to create a queue
			if (!tempVisitorLink.used) {
				return NextResponse.json({
					tracking: {
						status: "NOT_SUBMITTED",
						message: "Form belum diisi, silahkan isi formulir terlebih dahulu",
					},
				});
			}

			// If link is used but queue not found, something went wrong
			return NextResponse.json(
				{ error: "Antrean tidak ditemukan" },
				{ status: 404 }
			);
		}

		// Return queue status information
		const currentDate = new Date();
		currentDate.setHours(0, 0, 0, 0);
		// Get position data
		const waitingQueuesBeforeThis = await prisma.queue.count({
			where: {
				createdAt: {
					gte: currentDate,
				},
				queueNumber: { lt: queue.queueNumber },
				status: "WAITING",
			},
		});
		// Prepare queue tracking data
		const trackingData = {
			queueNumber: queue.queueNumber,
			serviceName: queue.service.name,
			visitorName: queue.visitor.name,
			status: queue.status,
			queueType: queue.queueType, // Add queue type to tracking data
			waitingBefore: waitingQueuesBeforeThis,
			estimated: waitingQueuesBeforeThis * 10, // Estimated wait in minutes, assuming 10 min per queue
			createdAt: queue.createdAt,
			startTime: queue.startTime,
			endTime: queue.endTime,
			filledSKD: queue.filledSKD || false,
		};

		// Generate a hash of the current data
		const serverHash = generateQueueHash(trackingData);

		// Check if the data has changed
		const hasChanges = !clientHash || clientHash !== serverHash;

		return NextResponse.json({
			tracking: {
				status: "SUCCESS",
				queue: trackingData,
			},
			hash: serverHash,
			hasChanges,
		});
	} catch (error) {
		console.error("Error tracking visitor queue:", error);
		return NextResponse.json(
			{ error: "Failed to track queue status" },
			{ status: 500 }
		);
	}
}
