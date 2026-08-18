// controllers/report.controller.js
import { Comparison } from "../models/Comparison.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { sendSuccess } from "../utils/responseHandler.js";

export const getDashboardMetrics = async (req, res, next) => {
  try {
    const { from, to, serviceCenter } = req.query;

    // 1. Build Date Filters
    const dateQuery = {};
    if (from || to) {
      dateQuery.createdAt = {};
      if (from) {
        dateQuery.createdAt.$gte = new Date(String(from));
      }
      if (to) {
        dateQuery.createdAt.$lte = new Date(String(to));
      }
    }

    // 2. Count feedback links
    const totalLinks = await FeedbackLink.countDocuments(dateQuery);
    const submittedLinks = await FeedbackLink.countDocuments({
      ...dateQuery,
      status: "SUBMITTED",
    });

    // 3. Build aggregation match conditions
    const comparisonMatch = {};
    if (from || to) {
      comparisonMatch.createdAt = {};
      if (from) {
        comparisonMatch.createdAt.$gte = new Date(String(from));
      }
      if (to) {
        comparisonMatch.createdAt.$lte = new Date(String(to));
      }
    }

    // 4. Construct Aggregation Pipelines
    const summaryPipeline = [
      { $match: comparisonMatch },
      {
        $lookup: {
          from: "complaints",
          localField: "complaintId",
          foreignField: "_id",
          as: "complaint",
        },
      },
      { $unwind: "$complaint" },
      {
        $lookup: {
          from: "customers",
          localField: "complaint.customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
    ];

    if (serviceCenter) {
      summaryPipeline.push({
        $match: { "customer.serviceCenter": String(serviceCenter) },
      });
    }

    summaryPipeline.push({
      $group: {
        _id: null,
        averageScore: { $avg: "$score" },
        totalAudited: { $sum: 1 },
        fullMatches: {
          $sum: { $cond: [{ $eq: ["$status", "FULL_MATCH"] }, 1, 0] },
        },
        partialMatches: {
          $sum: { $cond: [{ $eq: ["$status", "PARTIAL_MATCH"] }, 1, 0] },
        },
        mismatches: {
          $sum: { $cond: [{ $eq: ["$status", "MISMATCH"] }, 1, 0] },
        },
      },
    });

    const summaryResult = await Comparison.aggregate(summaryPipeline);
    const summary = summaryResult[0] || {
      averageScore: 0,
      totalAudited: 0,
      fullMatches: 0,
      partialMatches: 0,
      mismatches: 0,
    };

    // 5. Service Center performance breakdown
    const serviceCenterPipeline = [
      { $match: comparisonMatch },
      {
        $lookup: {
          from: "complaints",
          localField: "complaintId",
          foreignField: "_id",
          as: "complaint",
        },
      },
      { $unwind: "$complaint" },
      {
        $lookup: {
          from: "customers",
          localField: "complaint.customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $group: {
          _id: "$customer.serviceCenter",
          avgScore: { $avg: "$score" },
          auditVolume: { $sum: 1 },
          fullMatches: {
            $sum: { $cond: [{ $eq: ["$status", "FULL_MATCH"] }, 1, 0] },
          },
        },
      },
      { $sort: { avgScore: -1 } },
    ];

    const performanceBreakdown = await Comparison.aggregate(serviceCenterPipeline);

    sendSuccess(
      res,
      "Dashboard metrics fetched successfully",
      {
        linkMetrics: {
          generatedCount: totalLinks,
          submittedCount: submittedLinks,
          responseRate: totalLinks ? Number(((submittedLinks / totalLinks) * 100).toFixed(2)) : 0,
        },
        auditSummary: {
          totalAudited: summary.totalAudited,
          averageScore: summary.averageScore ? Number(summary.averageScore.toFixed(2)) : 0,
          fullMatches: summary.fullMatches,
          partialMatches: summary.partialMatches,
          mismatches: summary.mismatches,
        },
        serviceCenterPerformance: performanceBreakdown,
      },
      200,
    );
  } catch (error) {
    next(error);
  }
};