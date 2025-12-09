import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	try {
		const data = await req.json();
		const { tempUuid, filled } = data;

		// Validate required fields
		if (!tempUuid || typeof filled !== "boolean") {
			return NextResponse.json(
				{ error: "Missing required fields" },
				{ status: 400 }
			);
		}

		// Find and update the queue's SKD status
		const updatedQueue = await prisma.queue.update({
			where: { tempUuid },
			data: { filledSKD: filled },
			include: {
				visitor: {
					select: {
						name: true,
					},
				},
			},
		});

		if (!updatedQueue) {
			return NextResponse.json({ error: "Queue not found" }, { status: 404 });
		}

		// Create a notification about the SKD form submission
		if (filled) {
			await prisma.notification.create({
				data: {
					type: "SKD_FILLED",
					title: "SKD Diisi",
					message: `Pengunjung ${
						updatedQueue.visitor.name
					} telah mengisi form SKD untuk antrean #${
						updatedQueue.queueNumber
					}-${formatQueueDate(new Date(updatedQueue.createdAt))} `,
					isRead: false,
				},
			});
		}

		return NextResponse.json({
			success: true,
			message: filled
				? "SKD form marked as filled"
				: "SKD form marked as not filled",
		});
	} catch (error) {
		console.error("Error updating SKD status:", error);
		return NextResponse.json(
			{ error: "Failed to update SKD status" },
			{ status: 500 }
		);
	}
}
const formatQueueDate = (date: Date): string => {
	const day = date.getDate().toString().padStart(2, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	return `${day}${month}`;
}; // Create notification for staff
