// required to read environment variables
require("dotenv").config();

// dependencies
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const { json } = require("body-parser");
const fetch = require('node-fetch');
const rateLimit = require("express-rate-limit");

// limiters
const newCourseLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10
  });

  const newLinkLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60
  });

  const newSectionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20
  });

  const courseSearchLimiter = rateLimit({
    windowMs: 1000, // 1 second
      max: 100,
  });

  const serverGeneralLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 second
    max: 1000
  });

  const courseInfoLimiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds
    max: 30
  });

  const reportLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10
  });

// constants
const PORT = 8080;

//http response codes
const CREATED = 201;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;

// import model schema
const Course = require("./db/models/course")["course"]
const Section = require("./db/models/course")["section"]
const Link = require("./db/models/course")["link"]
const Report = require("./db/models/report")["report"]

// error handler
const errorHandler = (res, err) => {
    console.error(err);
    return res.status(SERVER_ERROR).json({ error: "An server error occured." })
}

// connect to database
mongoose
    .connect(process.env.MONGO_DB_URI, {
        useUnifiedTopology: true,
        useNewUrlParser: true,
        useFindAndModify: false,
        useCreateIndex: true
    })
    .then(() => console.log('DB Connected!'))
    .catch(err => {
        console.error(`MongoDB connection error:+ ${err.message}`);
    });

// middleware
app.use(cors());
app.use(bodyParser.json());
app.use(serverGeneralLimiter);

// utility function
const verifyReCaptcha = async (token) => {
    return (await (await fetch(`https://www.google.com/recaptcha/api/siteverify?response=${token}&secret=${process.env.RECAPTCHA_SECRET}`,
        {
            method: "POST"
        }
    )).json()).success
}

// ROUTES

/**
 * GET  /
 * 
 * Returns "Server is working." if the server is working.
 * 
 * PARAMETERS
 *   - none
 * 
 * RESPONSE
 *   - none
 */
app.get("/", (req, res) => res.send("Server is working."))

/**
 * GET  /courses/
 * 
 * Returns a list of all courses.
 * 
 * PARAMETERS
 *   - q(uery) (optional): return courses that matches this course code (wildcard match)
 *   - l(imit) (optional): limit the number of courses to return if over this limit 
 * 
 * RESPONSE
 *   - Array of courses: [{
 *       name: course name
 *       subject: course subject code
 *       number: course number code
 *     }]
 */
app.get("/courses", courseSearchLimiter,async (req, res) => {
    // return courses with course code that matches parameter q(uery) if provided
    const property = {};
    if (req.query.q) property.$or = [{ 'name': { $regex: req.query.q, $options: 'i' } }, { 'code': { $regex: req.query.q.replace(" ", ""), $options: 'i' } }]
    try {
        res.json(await Course.find(property, "-_id name faculty subject number", { limit: parseInt(req.query.l) || 0 }).exec())
    }
    catch (err) {
        errorHandler(res, err);
    }
})

/**
 * GET  /courses/:code 
 * 
 * Returns details for one course.
 * 
 * PARAMETERS
 *   - code: course code in XXXX#### format
 * 
 * RESPONSE
 *   - Array of course details: [{
 *       subject: course subject code
 *       number: course number
 *       sections: Array of sections: [
 *         name: name of the section
 *         links: [
 *           type: type of link
 *           url: url of link
 *           updatedAt: date and time link was last updated
 *         ]]
 *     }]
 */
app.get("/courses/:code", courseInfoLimiter, async (req, res) => {
    let code = req.params.code.trim().toUpperCase();
    if (!code) {
        return res.status(BAD_REQUEST).json({ error: "Bad request. Check parameters." })
    }
    try {
        const course = await Course.findOne({ code: code }, "-_id name subject faculty credits number sections.name sections.links._id sections.links.type sections.links.url sections.links.updatedAt").exec();
        if (!course) {
            return res.status(NOT_FOUND).json({ error: "Course not found." })
        }
        res.json(course)
    }
    catch (err) {
        errorHandler(res, err);
    }
})

/**
 * POST  /courses/
 * 
 * Creates a new course.
 * 
 * PARAMETERS
 *   - name: course name
 *   - subject: course subject code
 *   - number: course number
 * 
 * RESPONSE
 *   - Error or request body if successful
 *   - HTTP Status Codes: 
 *     - 201: Section created.
 *     - 400: Bad request. Check parameters and documentation.
 *     - 409: Course already exists. 
 *     - 500: Internal server error.
 */
app.post("/courses/", newCourseLimiter, async (req, res) => {
    try {
        if (!(req.body.name && req.body.subject && req.body.number && req.body.captcha && await verifyReCaptcha(req.body.captcha))) {
            return res.status(BAD_REQUEST).json({ error: "Bad request. Check parameters." })
        }
        course = await Course.findOne({ code: `${req.body.subject}${req.body.number}` }).exec();
        if (course) {
            return res.status(CONFLICT).json({ error: "Course already exists." })
        }
        await Course.create(req.body)
        res.status(CREATED).json(req.body);
    }
    catch (err) {
        errorHandler(res, err);
    }
});

/**
 * POST  /courses/:code/sections
 * 
 * Creates a new section for a given course.
 * 
 * PARAMETERS
 *   - :code: course code in XXXX#### format
 *   - name: section name
 *   - number: course number
 * 
 * RESPONSE
 *   - Error or request body if successful
 *   - HTTP Status Codes: 
 *     - 201: Section created.
 *     - 400: Bad request. Check parameters and documentation.
 *     - 409: Section already exists. 
 *     - 404: Course not found.
 *     - 500: Internal server error.
 */
app.post("/courses/:code/sections", newSectionLimiter, async (req, res) => {
    const code = req.params.code.trim().toUpperCase();
    try {
        if (!(code && req.body.name && req.body.captcha && await verifyReCaptcha(req.body.captcha))) {
            return res.status(BAD_REQUEST).json({ error: "Bad request. Check parameters." })
        }
        const section = new Section(req.body)
        let course = await Course.findOne({ code: code, "sections.name": req.body.name }).exec();
        if (course) {
            return res.status(CONFLICT).json({ error: "Section already exists." })
        }
        course = await Course.findOneAndUpdate({ code: code }, { $push: { sections: section } }).exec();
        if (!course) {
            return res.status(NOT_FOUND).json({ error: "Course not found." })
        }
        res.status(CREATED).json(req.body);
    }
    catch (err) {
        errorHandler(res, err);
    }
});

/**
 * POST  /courses/:code/sections/:section/link
 * 
 * Creates a new link for a given course and section.
 * 
 * PARAMETERS
 *   - :code: course code in XXXX#### format
 *   - :section: section name (case sensitive)
 *   - link: link type
 *   - url: link url
 * 
 * RESPONSE
 *   - Error or request body if successful
 *   - HTTP Status Codes: 
 *     - 201: Link created.
 *     - 400: Bad request. Check parameters and documentation.
 *     - 409: Link already exists. 
 *     - 404: Course or section not found.
 *     - 500: Internal server error.
 */
app.post("/courses/:code/sections/:section/link", newLinkLimiter, async (req, res) => {
    const code = req.params.code.trim().toUpperCase();
    const section = req.params.section;
    try {
        if (!(code && section && req.body.type && req.body.url && req.body.terms && req.body.captcha && await verifyReCaptcha(req.body.captcha))) {
            return res.status(BAD_REQUEST).json({ error: "Bad request. Check parameters." })
        }
        const link = new Link({ ...req.body, createdAt: new Date(), updatedAt: new Date() })
        let course = await Course.findOne({ code: code, "sections.name": section, "sections.links.url": req.body.url }).exec();
        if (course) {
            return res.status(CONFLICT).json({ error: "Link already exists." })
        }
        course = await Course.findOneAndUpdate({ code: code, "sections.name": section }, { $push: { "sections.$.links": link } }).exec();
        if (!course) {
            return res.status(NOT_FOUND).json({ error: "Course or section not found." })
        }
        res.status(CREATED).json(req.body);
    }
    catch (err) {
        errorHandler(res, err);
    }
});

/**
 * POST  /report
 * 
 * Reports a link.
 * 
 * PARAMETERS
 *   - id: the ObjectId of the link reportged
 * 
 * RESPONSE
 *   - Error or request body if successful
 *   - HTTP Status Codes: 
 *     - 201: Link created.
 *     - 400: Bad request. Check parameters and documentation.
 *     - 409: Link already exists. 
 *     - 404: Course or section not found.
 *     - 500: Internal server error.
 */
app.post("/report", reportLimiter, async (req, res) => {

    if (!(req.body.link_id && req.body.reason)) {
        return res.status(BAD_REQUEST).json({ error: "Bad request. Check parameters." })
    }
    try {
        await Report.create({ ...req.body, ip: req.connection.remoteAddress })
        res.status(CREATED).json(req.body);
    }
    catch (err) {
        errorHandler(res, err);
    }
});

// start application
app.listen(PORT, () => console.log(`Server is running at: http://localhost:${PORT}/`));