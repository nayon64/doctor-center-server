const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECERET_KEY);
const port = process.env.PORT || 5000;

const app = express();

// midleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.xicrlbt.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function varifyJWT(req, res, next) {
  const authHearder = req.headers.authraization;
  if (!authHearder) {
    return res.status(401).send("unauthrized access 141");
  }
  const token = authHearder.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "fobidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentCollection = client
      .db("doctorCenter")
      .collection("appointmentOptions");
    const bookingsCollection = client.db("doctorCenter").collection("bookings");
    const usersCollection = client.db("doctorCenter").collection("users");
    const doctorCollection = client.db("doctorCenter").collection("doctors");

    const varifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const filter = { email: decodedEmail };
      const userEmail = await usersCollection.findOne(filter);
      if (userEmail.role !== "Admin") {
        return res.status(403).send("Forbiden Access");
      } else {
        next();
      }
    };

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      const query = {};
      const bookingQuery = { date: date };
      const options = await appointmentCollection.find(query).toArray();
      const alredyBooked = await bookingsCollection
        .find(bookingQuery)
        .toArray();
      options.forEach((option) => {
        const bookedOption = alredyBooked.filter(
          (book) => book.tretmentName === option.name
        );
        const bookedSlots = bookedOption.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        option.slots = remainingSlots;
      });
      res.send(options);
    });

    app.get("/doctorSpecialty", async (req, res) => {
      const query = {};
      const specialty = await appointmentCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(specialty);
    });

    app.post("/addDoctor", varifyJWT, varifyAdmin, async (req, res) => {
      const doctorInfo = req.body;
      const doctor = await doctorCollection.insertOne(doctorInfo);
      res.send(doctor);
    });

    app.get("/addDoctor", varifyJWT, varifyAdmin, async (req, res) => {
      const query = {};
      const doctors = await doctorCollection.find(query).toArray();
      res.send(doctors);
    });

    app.delete("/doctors/:id", varifyJWT, varifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    });

    app.get("/payment/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const paymentAppointment = await bookingsCollection.findOne(query);
      res.send(paymentAppointment);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      console.log(paymentIntent);
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // app.post("/create-payment-intent", async (req, res) => {
    //   const booking = req.body;
    //   const price = booking.price
    //   const amount = price * 100
    //   console.log(amount)
    //   const paymentIntent = await stripe.paymentIntents.create({
    //     amount: amount,
    //     currency: "usd",
    //     "payment_method_types": ["card"],
    //   });
    //    res.send({
    //      clientSecret: paymentIntent.client_secret,
    //    });
    // })

    /* 
        API Naming Conversion  
        app.get("/bookings")
        app.get("/bookings/:id")
        app.post("/bookings")
        app.petch("/bookings/:id")
        app.delete("/bookings/:id")
    */

    app.get("/users/admin", varifyJWT, varifyAdmin, async (req, res) => {
      const query = {};
      const allUsers = await usersCollection.find(query).toArray();
      res.send(allUsers);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "Admin" });
    });

    app.put("/users/admin/:id", varifyJWT, varifyAdmin, async (req, res) => {
      const id = req.params.id;
      // const decodedEmail = req.decoded.email
      // const query = { email: decodedEmail }
      // const user = await usersCollection.findOne(query)
      // if (user.role !== "Admin") {
      //   return res.status(403).send({message: "forbidden access"})
      // }

      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: "Admin",
        },
      };
      const updateUser = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(updateUser);
    });

    app.delete("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      // const deleteUser = await usersCollection.deleteOne(query);
      res.send("deleteUser");
    });

    // user set in database by create by registration
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/bookings", varifyJWT, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "fobidden access" });
      }
      const query = {
        email: email,
      };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;

      const query = {
        email: email,
      };
      const user = await usersCollection.findOne(query);

      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "30d",
        });
        return res.send({ access_token: token });
      }
      return res.send({ access_token: "" });
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings", async (req, res) => {
      const query = {};
      const filter = await bookingsCollection.find(query).toArray();
      res.send(filter);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Doctor server is running....");
});

app.listen(port, () => {
  console.log(`doctor server is running  ${port}`);
});
