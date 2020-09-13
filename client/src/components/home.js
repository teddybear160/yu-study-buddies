import React, { useState, useEffect } from 'react';
import "bootstrap/dist/css/bootstrap.min.css";
import axios from 'axios';
import Header from "./header"

import "./home.css";

function Home() {
    const [searchText, setSearchText] = useState("");
    const [searchResults, setSearchResults] = useState("");

    useEffect(() => document.body.style.backgroundColor = "#E31837", []);

    const searchResultsElements = searchResults && searchResults.map((result) =>
        <a className="list-group-item list-group-item-action"
            href={`courses/${result.subject + result.number}`}
            key={result.subject + result.number}>
            <span class="font-weight-bold">{result.subject} {result.number}</span> - {result.name}
        </a>
    );

    searchResultsElements.push(
        <a className="list-group-item list-group-item-action"
            href="courses/add"
            key="add">
            <span class="font-weight-bold">Don't see your course?</span> Add it!
        </a>
    );
    return (
        <div >
            <Header white />
            <div id="home" class="container">
                <h1 id="welcome-text" className="text-white">Find course group chats. Connect with classmates. Ace your courses.</h1>
                <input type="text" className="form-control form-control-lg rounded-0" placeholder="Search for courses by code or name" value={searchText} onChange={async (e) => {
                    setSearchText(e.target.value)
                    await axios.get(`http://localhost:8080/courses?l=6&q=${searchText}`)
                        .then(response => {
                            setSearchResults(response.data)
                        })
                        .catch((error) => {
                            console.log(error);
                        })
                }} />
                <ul className="list-group rounded-0">
                    {searchText && searchResults && searchResultsElements}
                </ul>
            </div>
        </div>
    );
}

export default Home;
